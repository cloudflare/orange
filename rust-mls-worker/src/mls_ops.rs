use std::{
    collections::BTreeSet,
    sync::{Arc, Mutex},
};

use openmls::{
    group::{MlsGroup, MlsGroupCreateConfig, MlsGroupJoinConfig, StagedWelcome},
    prelude::{
        tls_codec::Serialize, ApplicationMessage, BasicCredential, Ciphersuite, CredentialWithKey,
        DeserializeBytes, KeyPackage, KeyPackageBundle, LeafNodeIndex, MlsMessageBodyIn,
        MlsMessageIn, MlsMessageOut, OpenMlsProvider, ProcessedMessageContent, RatchetTreeIn,
    },
    treesync::RatchetTree,
};
use openmls_basic_credential::SignatureKeyPair;
use openmls_rust_crypto::OpenMlsRustCrypto;

const CIPHERSUITE: Ciphersuite = Ciphersuite::MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519;

/// Contains the data created by existing member that a new users needs to join a group. This is an
/// MLS Welcome message along with the ratchet tree information
struct WelcomePackageOut {
    welcome: MlsMessageOut,
    ratchet_tree: RatchetTree,
}

/// Same as [`WelcomePackageOut`] but intended for incoming messages. This is created when the new
/// user deserializes some byte stream
struct WelcomePackageIn {
    welcome: MlsMessageIn,
    ratchet_tree: RatchetTreeIn,
}

/// An add or remove operation might result in a welcome package, and one or more MLS proposals
#[derive(Default)]
struct AddRemoveResponse {
    welcome: Option<WelcomePackageOut>,
    proposals: Vec<MlsMessageOut>,
}

/// Helper function that turns a key package into a unique UID
fn kp_to_uid(kp: &KeyPackage) -> &[u8] {
    // The ID is just the credential string inside the key package
    kp.leaf_node().credential().serialized_content()
}

#[derive(Default)]
struct WorkerState {
    mls_provider: OpenMlsRustCrypto,
    mls_group: Option<MlsGroup>,

    my_credential: Option<CredentialWithKey>,
    my_signing_keys: Option<SignatureKeyPair>,
    /// Is this user the Designated Committer of this group, i.e., the user with the lowest leaf index
    is_designated_committer: Option<bool>,
    /// The set of room members who have not yet been added to the MLS group
    pending_room_members: Vec<KeyPackage>,
}

impl WorkerState {
    /// Initializes MLS state with a unique identifier for this user. Also returns the freshly
    /// generated key package of this user.
    /// This MUST be executed before anything else in this module.
    fn new(uid: Vec<u8>) -> (WorkerState, KeyPackageBundle) {
        let mut state = WorkerState::default();
        let credential = BasicCredential::new(uid);

        // Generate new signing keys
        let signature_keys = SignatureKeyPair::new(CIPHERSUITE.signature_algorithm())
            .expect("couldn't generate signing key");

        // Store the signature key into the key store so OpenMLS has access to it.
        signature_keys
            .store(state.mls_provider.storage())
            .expect("couldn't store signature keys");
        let cred = CredentialWithKey {
            credential: credential.into(),
            signature_key: signature_keys.public().into(),
        };

        // Construct the key package
        let key_package = KeyPackage::builder()
            .build(
                CIPHERSUITE,
                &state.mls_provider,
                &signature_keys,
                cred.clone(),
            )
            .unwrap();

        // Save the credential and keys into the state struct
        state.my_credential = Some(cred);
        state.my_signing_keys = Some(signature_keys);

        (state, key_package)
    }

    /// Starts a new MLS group. This is called if this user is the first user in the room
    fn start_group(&mut self) {
        self.mls_group = Some(
            MlsGroup::new(
                &self.mls_provider,
                self.my_signing_keys
                    .as_ref()
                    .expect("used start_group() before initialize()"),
                &MlsGroupCreateConfig::default(),
                self.my_credential
                    .clone()
                    .expect("used start_group() before initialize()"),
            )
            .expect("couldn't create group"),
        );

        // We're the only person in the group, so we're the designated committer
        self.is_designated_committer = Some(true);
    }

    /// Join a group using the given MLS Welcome message
    fn join_group(&mut self, wp: WelcomePackageIn) {
        let WelcomePackageIn {
            welcome,
            ratchet_tree,
        } = wp;

        // Process the message
        if let MlsMessageBodyIn::Welcome(w) = welcome.extract() {
            let staged_join = StagedWelcome::new_from_welcome(
                &self.mls_provider,
                &MlsGroupJoinConfig::default(),
                w,
                Some(ratchet_tree),
            )
            .expect("could not stage welcome");

            // Create a group from the processed welcome
            self.mls_group = Some(
                staged_join
                    .into_group(&self.mls_provider)
                    .expect("error joining group"),
            );

            // We cannot be the designated committer because we just recieved a Welcome from the DC
            self.is_designated_committer = Some(false);
        } else {
            panic!("expected Welcome message in join_group")
        }
    }

    /// If this user is the Designated Committer, this will create a welcome package for the for the
    /// new user and a Commit with an Add operation in it, and it will update the current state to
    /// include the Add. Otherwise, this will just note that a new user has joined the room but not
    /// yet been added to the MLS group.
    fn add_user(&mut self, user_kp: KeyPackage) -> AddRemoveResponse {
        let uid = kp_to_uid(&user_kp);

        if self.is_designated_committer.unwrap() {
            // Sanity check: if we're the DC and adding a new member, we shouldn't have any
            // pending members
            assert!(self.pending_room_members.is_empty());

            // Create the Add proposal
            let (commit, welcome, _) = self
                .mls_group
                .as_mut()
                .unwrap()
                .add_members(
                    &self.mls_provider,
                    self.my_signing_keys.as_ref().unwrap(),
                    &[user_kp],
                )
                .expect("couldn't add user to group");

            // Merge the pending proposal we just made so we can export the new ratchet tree and
            // give it to the new user
            self.mls_group
                .as_mut()
                .unwrap()
                .merge_pending_commit(&self.mls_provider)
                .unwrap();
            let ratchet_tree = self.mls_group.as_ref().unwrap().export_ratchet_tree();

            AddRemoveResponse {
                welcome: Some(WelcomePackageOut {
                    welcome,
                    ratchet_tree,
                }),
                proposals: vec![commit],
            }
        } else {
            self.pending_room_members.push(user_kp);
            AddRemoveResponse::default()
        }
    }

    /// If this user is the Designated Committer, this will create a Remove message
    /// for the rest of the group. Otherwise, this will just note that a user has been
    /// removed from the room,  but not yet been removed from the MLS group
    fn remove_user(&mut self, uid_to_remove: &[u8]) -> AddRemoveResponse {
        let group = self.mls_group.as_mut().unwrap();
        let was_previously_designated_committer = self.is_designated_committer.unwrap();

        // Check if this removal turns me into the Designated Committer
        // Do a linear search through the set of users to find the one with the given UID
        let removed_leaf_idx = group
            .members()
            .position(|member| member.credential.serialized_content() == uid_to_remove)
            .expect("could not find user in tree") as u32;
        // Check if the removed user was the DC, i.e., was the existing user with the lowest index
        let removed_user_was_dc =
            (0..removed_leaf_idx).any(|i| group.member(LeafNodeIndex::new(i)).is_some());
        // Now check if there is someone between the removed user and me
        let my_leaf_idx = group.own_leaf_index().u32();
        let exists_other_designee =
            (removed_leaf_idx..my_leaf_idx).any(|i| group.member(LeafNodeIndex::new(i)).is_some());
        // If the removed user was the DC, and there's nobody between us, then we're the new DC
        if removed_user_was_dc && !exists_other_designee {
            self.is_designated_committer = Some(true);
        }
        // Record whether our status changed. If the previous DC died before adding pending users,
        // we will have to do that
        let became_dc =
            !was_previously_designated_committer && self.is_designated_committer.unwrap();

        // If we're the designated committer then we have to remove the old DC
        if self.is_designated_committer.unwrap() {
            // Sanity check: if we're the incumbent DC and removing a member, we shouldn't have any pending
            // members
            if !became_dc {
                assert!(self.pending_room_members.is_empty());
            }

            // Do the removal operation
            let (removal, _, _) = group
                .remove_members(
                    &self.mls_provider,
                    self.my_signing_keys.as_ref().unwrap(),
                    &[LeafNodeIndex::new(removed_leaf_idx as u32)],
                )
                .expect("could not remove user");

            // The previous DC may have died before adding all the pending users. Go add them now
            let (additions, welcome, _) = self
                .mls_group
                .as_mut()
                .unwrap()
                .add_members(
                    &self.mls_provider,
                    self.my_signing_keys.as_ref().unwrap(),
                    &self.pending_room_members,
                )
                .expect("couldn't add user to group");

            // Merge all the above pending proposals so we can export the new ratchet tree and
            // give it to the new users
            self.mls_group
                .as_mut()
                .unwrap()
                .merge_pending_commit(&self.mls_provider)
                .unwrap();
            let ratchet_tree = self.mls_group.as_ref().unwrap().export_ratchet_tree();

            // Once we've added these users, they are no longer pending, so remove them
            self.pending_room_members.clear();

            AddRemoveResponse {
                welcome: Some(WelcomePackageOut {
                    welcome,
                    ratchet_tree,
                }),
                proposals: vec![removal, additions],
            }
        } else {
            // Quick sanity check: if we're removing a user, they should not be in the pending list
            assert!(self
                .pending_room_members
                .iter()
                .find(|kp| kp_to_uid(&kp) == uid_to_remove)
                .is_none());
            // Another quick sanity check: if we're removing a user, and they weren't the DC, then
            // there shouldn't be any pending additions
            if !removed_user_was_dc {
                assert!(self.pending_room_members.is_empty());
            }
            // Nothing to return
            AddRemoveResponse::default()
        }
    }

    /// Applies the given MLS commit to the group state
    fn handle_commit(&mut self, msg: MlsMessageIn) {
        let group = self.mls_group.as_mut().unwrap();

        // Process the message into a Staged Commit
        let prot_msg = msg.try_into_protocol_message().unwrap();
        let processed_message = group
            .process_message(&self.mls_provider, prot_msg)
            .expect("could not process message")
            .into_content();
        if let ProcessedMessageContent::StagedCommitMessage(staged_com) = processed_message {
            // Collect all the UIDs of the users being added
            let uids_being_added: BTreeSet<Vec<u8>> = staged_com
                .add_proposals()
                .map(|p| kp_to_uid(p.add_proposal().key_package()).to_vec())
                .collect();

            // Merge the Commit into the group state
            group
                .merge_staged_commit(&self.mls_provider, *staged_com)
                .expect("couldn't merge commit");

            // After successful add, remove the UIDs from the pending list. In other words, retain
            // the UIDs that aren't in the pending list
            self.pending_room_members
                .retain(|kp| !uids_being_added.contains(kp_to_uid(kp)));
        } else {
            panic!("expected Commit message")
        }
    }

    /// Takes a message, encrypts it, frames it as an MlsMessageOut, and serializes it
    fn encrypt_app_msg(&mut self, msg: &[u8]) -> Vec<u8> {
        let out = self
            .mls_group
            .as_mut()
            .unwrap()
            .create_message(
                &self.mls_provider,
                self.my_signing_keys.as_ref().unwrap(),
                msg,
            )
            .unwrap();

        out.to_bytes().unwrap()
    }

    /// Takes a ciphertext, deserializes it, decrypts it into an Application Message, and returns
    /// the bytes
    fn decrypt_app_msg(&mut self, ct: &[u8]) -> Vec<u8> {
        let group = self.mls_group.as_mut().unwrap();
        let framed = MlsMessageIn::tls_deserialize_exact_bytes(ct).unwrap();

        // Process the ciphertext into an application message
        let msg = group
            .process_message(
                &self.mls_provider,
                framed.try_into_protocol_message().unwrap(),
            )
            .expect("could not process message")
            .into_content();

        match msg {
            ProcessedMessageContent::ApplicationMessage(app_msg) => app_msg.into_bytes(),
            _ => {
                panic!("unexpected MLS message {:?}", msg)
            }
        }
    }
}

// Now define the top-level functions that touch global state. These are thin wrappers
// over the underlying methods

thread_local! {
    static STATE: Arc<Mutex<WorkerState>> = Arc::new(Mutex::new(WorkerState::default()));
}

/// Creates a new state and returns the user's key package
pub fn new_state(uid: &str) -> KeyPackage {
    let uid_bytes = uid.as_bytes().to_vec();
    let key_pkg = STATE
        .try_with(|mutex| {
            let mut state = mutex.lock().expect("couldn't lock mutex");
            let (new_state, key_pkg) = WorkerState::new(uid_bytes);
            *state = new_state;
            key_pkg
        })
        .expect("couldn't acquire thread-local storage");

    // Return key package
    key_pkg.key_package().clone()
}

pub fn start_group() {
    STATE
        .try_with(|mutex| {
            mutex.lock().expect("couldn't lock mutex").start_group();
        })
        .expect("couldn't acquire thread-local storage");
}

pub fn encrypt_msg(msg: &[u8]) -> Vec<u8> {
    STATE
        .try_with(|mutex| {
            mutex
                .lock()
                .expect("couldn't lock mutex")
                .encrypt_app_msg(msg)
        })
        .expect("couldn't acquire thread-local storage")
}

pub fn decrypt_msg(msg: &[u8]) -> Vec<u8> {
    STATE
        .try_with(|mutex| {
            mutex
                .lock()
                .expect("couldn't lock mutex")
                .decrypt_app_msg(msg)
        })
        .expect("couldn't acquire thread-local storage")
}

#[test]
fn end_to_end() {
    // Converts an MlsMessageOut to an MlsMessageIn
    fn msg_out_to_in(m: &MlsMessageOut) -> MlsMessageIn {
        let bytes = m.tls_serialize_detached().unwrap();
        MlsMessageIn::tls_deserialize_exact_bytes(&bytes).unwrap()
    }

    // Converts a WelcomePackageOut to a WelcomePackageIn
    fn welcome_out_to_in(wp: &WelcomePackageOut) -> WelcomePackageIn {
        let WelcomePackageOut {
            welcome,
            ratchet_tree,
        } = wp;

        WelcomePackageIn {
            welcome: msg_out_to_in(welcome),
            ratchet_tree: RatchetTreeIn::tls_deserialize_exact_bytes(
                &ratchet_tree.tls_serialize_detached().unwrap(),
            )
            .unwrap(),
        }
    }

    let (mut alice_group, _alice_key_pkg) = WorkerState::new(b"Alice".to_vec());
    let (mut bob_group, bob_key_pkg) = WorkerState::new(b"Bob".to_vec());
    let (mut charlie_group, charlie_key_pkg) = WorkerState::new(b"Charlie".to_vec());

    // Alice starts the group
    alice_group.start_group();

    // Alice adds Bob
    let add_op = alice_group.add_user(bob_key_pkg.key_package().clone());
    // The Add op is a welcome package and 1 proposal
    assert!(add_op.welcome.is_some());
    assert_eq!(add_op.proposals.len(), 1);

    // Pretend Bob parsed the welcome package
    let wp = welcome_out_to_in(add_op.welcome.as_ref().unwrap());
    // Bob joins the group
    bob_group.join_group(wp);

    // Now Alice adds Charlie
    let add_op = alice_group.add_user(charlie_key_pkg.key_package().clone());
    // Bob sees that the Add came in but Alice hasn't sent a proposal yet
    bob_group.add_user(charlie_key_pkg.key_package().clone());
    // Pretend Bob parsed the Add and Charlies parsed the welcome package
    let wp = welcome_out_to_in(add_op.welcome.as_ref().unwrap());
    let add = msg_out_to_in(&add_op.proposals[0]);
    // Charlie joins the group
    charlie_group.join_group(wp);
    // Bob processes that Charlie was added
    bob_group.handle_commit(add);
}
