use std::{
    collections::BTreeSet,
    sync::{Arc, Mutex},
};

use log::info;
use openmls::{
    group::{
        MlsGroup, MlsGroupCreateConfig, MlsGroupJoinConfig, ProcessMessageError, StagedWelcome,
    },
    prelude::{
        BasicCredential, Ciphersuite, CredentialWithKey, DeserializeBytes, KeyPackage,
        KeyPackageBundle, KeyPackageIn, LeafNodeIndex, MlsMessageBodyIn, MlsMessageIn,
        MlsMessageOut, OpenMlsProvider, ProcessedMessageContent, ProtocolVersion, RatchetTreeIn,
        SenderRatchetConfiguration,
    },
    treesync::RatchetTree,
};
use openmls_basic_credential::SignatureKeyPair;
use openmls_rust_crypto::OpenMlsRustCrypto;
use thiserror::Error;

const CIPHERSUITE: Ciphersuite = Ciphersuite::MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519;
const PROT_VERSION: ProtocolVersion = ProtocolVersion::Mls10;
// Permit decryption of messages that are up to 500 messages old (for that sender)
const OUT_OF_ORDER_TOLERANCE: u32 = 500;
// Permit decryption of messages from up to 1000 messages in the future (for that sender). 1000 is
// the default.
const MAX_MESSAGE_SEQ_JUMP: u32 = 1000;

type SafetyNumber = [u8; 32];

/// Error incurred when attempting to decrypt an app message (in our case, an encrypted frame from
/// a video/audio stream)
#[derive(Error, Debug, PartialEq, Clone)]
pub enum DecryptAppMsgError {
    #[error(transparent)]
    Mls(#[from] openmls::prelude::Error),

    #[error(transparent)]
    Processing(#[from] openmls::prelude::ProcessMessageError),

    #[error("Not in a group, so decryption does not make sense")]
    NoGroup,

    #[error("Wrong message type: {0}")]
    WrongMsgType(&'static str),
}

/// Contains the data created by existing member that a new users needs to join a group. This is an
/// MLS Welcome message along with the ratchet tree information
pub(crate) struct WelcomePackageOut {
    pub(crate) welcome: MlsMessageOut,
    pub(crate) ratchet_tree: RatchetTree,
}

/// Same as [`WelcomePackageOut`] but intended for incoming messages. This is created when the new
/// user deserializes some byte stream
struct WelcomePackageIn {
    welcome: MlsMessageIn,
    ratchet_tree: RatchetTreeIn,
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
    /// Is this user the Designated Committer of this group, i.e., the user with the lowest leaf
    /// index
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

    fn safety_number(&self) -> SafetyNumber {
        let mut sn = SafetyNumber::default();
        // Get the epoch authenticator and truncate it to 256 bits
        sn.copy_from_slice(
            &self
                .mls_group
                .as_ref()
                .unwrap()
                .epoch_authenticator()
                .as_slice()[..32],
        );
        sn
    }

    fn uid(&self) -> &[u8] {
        self.my_credential
            .as_ref()
            .unwrap()
            .credential
            .serialized_content()
    }

    fn uid_as_str(&self) -> String {
        // We can unwrap here because UID is always initially a string in the event object we
        // receive
        String::from_utf8(self.uid().to_vec()).unwrap()
    }

    /// Starts a new MLS group. This is called if this user is the first user in the room. Returns a
    /// new safety number and nothing else
    fn start_group(&mut self) -> SafetyNumber {
        let config = MlsGroupCreateConfig::builder()
            .sender_ratchet_configuration(SenderRatchetConfiguration::new(
                OUT_OF_ORDER_TOLERANCE,
                MAX_MESSAGE_SEQ_JUMP,
            ))
            .build();

        self.mls_group = Some(
            MlsGroup::new(
                &self.mls_provider,
                self.my_signing_keys
                    .as_ref()
                    .expect("used start_group() before initialize()"),
                &config,
                self.my_credential
                    .clone()
                    .expect("used start_group() before initialize()"),
            )
            .expect("couldn't create group"),
        );

        // We're the only person in the group, so we're the designated committer
        self.is_designated_committer = Some(true);

        // Return the new safety number
        self.safety_number()
    }

    /// Join a group using the given MLS Welcome message
    fn join_group(&mut self, wp: WelcomePackageIn) -> WorkerResponse {
        let WelcomePackageIn {
            welcome,
            ratchet_tree,
        } = wp;

        // Permit decryption of old frames
        let config = MlsGroupJoinConfig::builder()
            .sender_ratchet_configuration(SenderRatchetConfiguration::new(
                OUT_OF_ORDER_TOLERANCE,
                MAX_MESSAGE_SEQ_JUMP,
            ))
            .build();

        // Process the message
        if let MlsMessageBodyIn::Welcome(w) = welcome.extract() {
            // If we can't process this Welcome, it's because it's not meant for us. Return early
            let Ok(staged_join) =
                StagedWelcome::new_from_welcome(&self.mls_provider, &config, w, Some(ratchet_tree))
            else {
                return WorkerResponse::default();
            };

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

        // Return the new safety number
        WorkerResponse {
            new_safety_number: Some(self.safety_number()),
            ..Default::default()
        }
    }

    /// If this user is the Designated Committer, this will create a welcome package for the for the
    /// new user and a Commit with an Add operation in it, and it will update the current state to
    /// include the Add. Otherwise, this will just note that a new user has joined the room but not
    /// yet been added to the MLS group.
    fn add_user(&mut self, user_kp: KeyPackageIn) -> WorkerResponse {
        let user_kp = user_kp
            .validate(self.mls_provider.crypto(), PROT_VERSION)
            .unwrap();

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

            WorkerResponse {
                welcome: Some(WelcomePackageOut {
                    welcome,
                    ratchet_tree,
                }),
                proposals: vec![commit],
                new_safety_number: Some(self.safety_number()),
                sender_id: Some(self.uid_as_str()),
                ..Default::default()
            }
        } else {
            self.pending_room_members.push(user_kp);
            WorkerResponse::default()
        }
    }

    /// If this user is the Designated Committer, this will create a Remove message
    /// for the rest of the group. Otherwise, this will just note that a user has been
    /// removed from the room,  but not yet been removed from the MLS group.
    /// This will panic if a user tries to remove themselves.
    fn remove_user(&mut self, uid_to_remove: &[u8]) -> WorkerResponse {
        if uid_to_remove == self.uid() {
            panic!("cannot remove self");
        }

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
            (0..removed_leaf_idx).all(|i| group.member(LeafNodeIndex::new(i)).is_none());
        // Now check if there is someone between the removed user and me
        let my_leaf_idx = group.own_leaf_index().u32();
        let exists_other_designee = (removed_leaf_idx + 1..my_leaf_idx)
            .any(|i| group.member(LeafNodeIndex::new(i)).is_some());
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
                    &[LeafNodeIndex::new(removed_leaf_idx)],
                )
                .expect("could not remove user");
            group.merge_pending_commit(&self.mls_provider).unwrap();

            // The previous DC may have died before adding all the pending users. Go add them now
            let (additions, welcome) = if !self.pending_room_members.is_empty() {
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
                (Some(additions), Some(welcome))
            } else {
                (None, None)
            };

            // Merge all the above pending proposals so we can export the new ratchet tree and
            // give it to the new users (if there are any)
            self.mls_group
                .as_mut()
                .unwrap()
                .merge_pending_commit(&self.mls_provider)
                .unwrap();
            let ratchet_tree = self.mls_group.as_ref().unwrap().export_ratchet_tree();

            // Once we've added these users, they are no longer pending, so remove them
            self.pending_room_members.clear();

            // Definitely send the Remove. If a new user was added, also send the Add
            let proposals = core::iter::once(removal).chain(additions).collect();

            // Record the mesages we send out

            WorkerResponse {
                // If a new user was added, construct the welcome package
                welcome: welcome.map(|w| WelcomePackageOut {
                    welcome: w,
                    ratchet_tree,
                }),
                proposals,
                new_safety_number: Some(self.safety_number()),
                sender_id: Some(self.uid_as_str()),
                ..Default::default()
            }
        } else {
            // Quick sanity check: if we're removing a user, they should not be in the pending list
            assert!(!self
                .pending_room_members
                .iter()
                .any(|kp| kp_to_uid(kp) == uid_to_remove));
            // Another quick sanity check: if we're removing a user, and they weren't the DC, then
            // there shouldn't be any pending additions
            if !removed_user_was_dc {
                assert!(self.pending_room_members.is_empty());
            }
            // Nothing to return
            WorkerResponse::default()
        }
    }

    /// Applies the given MLS commit to the group state
    fn handle_commit(&mut self, msg: MlsMessageIn) -> WorkerResponse {
        let group = self.mls_group.as_mut().unwrap();

        // Process the message into a Staged Commit
        let prot_msg = msg.try_into_protocol_message().unwrap();

        let processed_message = match group.process_message(&self.mls_provider, prot_msg) {
            Ok(m) => m.into_content(),

            // If the message is from the wrong epoch, ignore it. Things can't really get out of
            // order when we have a designated committer and a strongly serializing message delivery
            // service.
            // TODO: Test this edge case. What happens if the DC dies and then the MDS receives
            // their messages? Then either:
            // * Users will know its dead and reject further messages (not the current logic).
            //   * The joiner will not know that the Welcome comes from a dead DC, so they will
            //     process it
            //   * The new DC will send a Remove, then Add, and a Welcome. The joiner will not
            //     process the new Welcome, but will attempt to process the Remove and fail, since
            //     the new DC didn't process the old DC's Add. So the new user is locked out.
            // * Users will accept the old DC's Add message for the joiner, then the new DC's
            //   Remove message for the old DC. The joiner will accept the Welcome, fail to process
            //   the Add, then succeed in processing the Remove, which is good.
            Err(ProcessMessageError::ValidationError(
                openmls::group::ValidationError::WrongEpoch,
            )) => {
                return WorkerResponse::default();
            }
            Err(e) => {
                panic!("could not process message: {e}")
            }
        };
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

            // Return the new safety number
            WorkerResponse {
                new_safety_number: Some(self.safety_number()),
                ..Default::default()
            }
        } else {
            panic!("expected Commit message")
        }
    }

    /// Takes a message, encrypts it, frames it as an `MlsMessageOut`, and serializes it. If
    /// `self.mls_group` doesn't exist, returns all 0s, with the length of `msg`.
    fn encrypt_app_msg_nofail(&mut self, msg: &[u8]) -> Vec<u8> {
        self.mls_group
            .as_mut()
            .map(|group| {
                group
                    .create_message(
                        &self.mls_provider,
                        self.my_signing_keys.as_ref().unwrap(),
                        msg,
                    )
                    .unwrap()
                    .to_bytes()
                    .unwrap()
            })
            .unwrap_or_else(|| vec![0u8; msg.len()])
    }

    /// Takes a ciphertext, deserializes it, decrypts it into an Application Message, and returns
    /// the bytes.
    fn decrypt_app_msg(&mut self, ct: &[u8]) -> Result<Vec<u8>, DecryptAppMsgError> {
        let group = self.mls_group.as_mut().ok_or(DecryptAppMsgError::NoGroup)?;
        let framed = MlsMessageIn::tls_deserialize_exact_bytes(ct)?;

        // Process the ciphertext into an application message
        let msg = group
            .process_message(
                &self.mls_provider,
                framed.try_into_protocol_message().unwrap(),
            )?
            .into_content();

        match msg {
            ProcessedMessageContent::ApplicationMessage(app_msg) => Ok(app_msg.into_bytes()),
            ProcessedMessageContent::ProposalMessage(_) => {
                Err(DecryptAppMsgError::WrongMsgType("proposal"))
            }
            ProcessedMessageContent::ExternalJoinProposalMessage(_) => {
                Err(DecryptAppMsgError::WrongMsgType("external join proposal"))
            }
            ProcessedMessageContent::StagedCommitMessage(_) => {
                Err(DecryptAppMsgError::WrongMsgType("staged commit"))
            }
        }
    }

    /// Takes a ciphertext, deserializes it, decrypts it into an Application Message, and returns
    /// the bytes. If any error happens, returns the empty vec.
    fn decrypt_app_msg_nofail(&mut self, ct: &[u8]) -> Vec<u8> {
        self.decrypt_app_msg(ct).unwrap_or_else(|e| {
            info!("Frame decryption failed: {e}");
            Vec::new()
        })
    }
}

// Now define the top-level functions that touch global state. These are thin wrappers
// over the underlying methods

thread_local! {
    static STATE: Arc<Mutex<WorkerState>> = Arc::new(Mutex::new(WorkerState::default()));
}

/// A create, join, add, or remove operation might result in a welcome package, one or more MLS
/// proposals, a new safety number, and/or a user key pacakge
#[derive(Default)]
pub(crate) struct WorkerResponse {
    pub(crate) welcome: Option<WelcomePackageOut>,
    pub(crate) proposals: Vec<MlsMessageOut>,
    pub(crate) new_safety_number: Option<SafetyNumber>,
    pub(crate) key_pkg: Option<KeyPackage>,
    pub(crate) sender_id: Option<String>,
}

/// Acquires the global state, clears it, and generates a new identity
pub fn new_state(uid: &str) -> WorkerResponse {
    let uid_bytes = uid.as_bytes().to_vec();
    STATE
        .try_with(|mutex| {
            // Create a new state and start a new group
            let mut state = mutex.lock().expect("couldn't lock mutex");
            let (new_state, key_pkg) = WorkerState::new(uid_bytes);

            // Update the state
            *state = new_state;

            // Respond with the key package
            WorkerResponse {
                key_pkg: Some(key_pkg.key_package().clone()),
                ..Default::default()
            }
        })
        .expect("couldn't acquire thread-local storage")
}

/// Acquires the global state, clears it, generates a new identity, and starts a new MLS group
pub fn new_state_and_start_group(uid: &str) -> WorkerResponse {
    let uid_bytes = uid.as_bytes().to_vec();
    STATE
        .try_with(|mutex| {
            // Create a new state and start a new group
            let mut state = mutex.lock().expect("couldn't lock mutex");
            let (mut new_state, _) = WorkerState::new(uid_bytes);
            let safety_number = new_state.start_group();

            // Update the state
            *state = new_state;

            // Respond with the safety number. Key package isn't necessary because there's nobody to
            // give it to yet
            WorkerResponse {
                new_safety_number: Some(safety_number),
                ..Default::default()
            }
        })
        .expect("couldn't acquire thread-local storage")
}

/// Acquires the global state and encrypts the message if the MLS group exists. If not, returns all
/// 0s with the length of `msg`
pub fn encrypt_msg(msg: &[u8]) -> Vec<u8> {
    STATE
        .try_with(|mutex| {
            mutex
                .lock()
                .expect("couldn't lock mutex")
                .encrypt_app_msg_nofail(msg)
        })
        .expect("couldn't acquire thread-local storage")
}

/// Acquires the global state and attempts to decrypt the given MLS application message. On failure,
/// returns the empty vector.
pub fn decrypt_msg(msg: &[u8]) -> Vec<u8> {
    STATE
        .try_with(|mutex| {
            mutex
                .lock()
                .expect("couldn't lock mutex")
                .decrypt_app_msg_nofail(msg)
        })
        .expect("couldn't acquire thread-local storage")
}

/// Acquires the global state and adds the given user by key package
pub fn add_user(serialized_kp: &[u8]) -> WorkerResponse {
    let key_pkg = KeyPackageIn::tls_deserialize_exact_bytes(serialized_kp).unwrap();

    STATE
        .try_with(|mutex| mutex.lock().expect("couldn't lock mutex").add_user(key_pkg))
        .expect("couldn't acquire thread-local storage")
}

/// Acquires the global state and removes the given user by their UID
pub fn remove_user(uid_to_remove: &str) -> WorkerResponse {
    let uid_bytes = uid_to_remove.as_bytes();

    STATE
        .try_with(|mutex| {
            mutex
                .lock()
                .expect("couldn't lock mutex")
                .remove_user(uid_bytes)
        })
        .expect("couldn't acquire thread-local storage")
}

/// Acquires the global state and joins the group given by the welcome package and ratchet tree
pub fn join_group(serialized_welcome: &[u8], serialized_rtree: &[u8]) -> WorkerResponse {
    let welcome = MlsMessageIn::tls_deserialize_exact_bytes(serialized_welcome).unwrap();
    let ratchet_tree = RatchetTreeIn::tls_deserialize_exact_bytes(serialized_rtree).unwrap();

    STATE
        .try_with(|mutex| {
            mutex
                .lock()
                .expect("couldn't lock mutex")
                .join_group(WelcomePackageIn {
                    welcome,
                    ratchet_tree,
                })
        })
        .expect("couldn't acquire thread-local storage")
}

/// Acquires the global state and processes the given Commit message from the given sender
pub fn handle_commit(serialized_commit: &[u8], sender_uid: &str) -> WorkerResponse {
    let uid_bytes = sender_uid.as_bytes().to_vec();
    let commit = MlsMessageIn::tls_deserialize_exact_bytes(serialized_commit).unwrap();

    STATE
        .try_with(|mutex| {
            let mut state = mutex.lock().expect("couldn't lock mutex");
            // A user cannot process a commit created by themselves. Ignore
            if state.uid() == uid_bytes {
                WorkerResponse::default()
            } else {
                state.handle_commit(commit)
            }
        })
        .expect("couldn't acquire thread-local storage")
}

#[cfg(test)]
mod tests {
    use super::*;
    use openmls::prelude::tls_codec::Serialize;
    use rand::seq::SliceRandom;

    impl WorkerResponse {
        fn is_default(&self) -> bool {
            self.welcome.is_none()
                && self.proposals.is_empty()
                && self.new_safety_number.is_none()
                && self.key_pkg.is_none()
        }
    }

    // Converts an MlsMessageOut to an MlsMessageIn
    fn msg_out_to_in(m: &MlsMessageOut) -> MlsMessageIn {
        let bytes = m.tls_serialize_detached().unwrap();
        MlsMessageIn::tls_deserialize_exact_bytes(&bytes).unwrap()
    }

    /// Converts a KeyPackage to a KeyPackageIn
    fn key_pkg_out_to_in(kp: &KeyPackage) -> KeyPackageIn {
        KeyPackageIn::tls_deserialize_exact_bytes(&kp.tls_serialize_detached().unwrap()).unwrap()
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

    #[test]
    fn end_to_end() {
        let (mut alice_group, _alice_key_pkg) = WorkerState::new(b"Alice".to_vec());
        let (mut bob_group, bob_key_pkg) = WorkerState::new(b"Bob".to_vec());
        let (mut charlie_group, charlie_key_pkg) = WorkerState::new(b"Charlie".to_vec());

        // Alice starts the group
        alice_group.start_group();

        // Alice adds Bob
        let add_op = alice_group.add_user(key_pkg_out_to_in(bob_key_pkg.key_package()));
        // The Add op is a welcome package and 1 proposal
        assert!(add_op.welcome.is_some());
        assert_eq!(add_op.proposals.len(), 1);

        // Pretend Bob parsed the welcome package
        let wp = welcome_out_to_in(add_op.welcome.as_ref().unwrap());
        // Bob joins the group
        bob_group.join_group(wp);

        // Now Alice adds Charlie
        let add_op = alice_group.add_user(key_pkg_out_to_in(charlie_key_pkg.key_package()));
        // Bob sees that the Add came in but Alice hasn't sent a proposal yet
        bob_group.add_user(key_pkg_out_to_in(charlie_key_pkg.key_package()));
        // Pretend Bob parsed the Add and Charlies parsed the welcome package
        let wp = welcome_out_to_in(add_op.welcome.as_ref().unwrap());
        let add = msg_out_to_in(&add_op.proposals[0]);
        // Charlie joins the group
        charlie_group.join_group(wp);
        // Bob processes that Charlie was added
        bob_group.handle_commit(add);

        // Now encrypt something
        let msg = b"hello world";
        let ct = alice_group.encrypt_app_msg_nofail(msg);
        assert_eq!(bob_group.decrypt_app_msg(&ct).unwrap(), msg);
        assert_eq!(charlie_group.decrypt_app_msg(&ct).unwrap(), msg);

        // Now Alice gets removed. Everyone removes her
        let bob_out = bob_group.remove_user(b"Alice");
        let charlie_out = charlie_group.remove_user(b"Alice");
        // Bob is the DC, so Charlie's output should be empty
        assert!(charlie_out.is_default());
        // Bob's output should be 1 Add proposal
        assert_eq!(bob_out.proposals.len(), 1);

        // Let Charlie process Bob's new message
        charlie_group.handle_commit(msg_out_to_in(&bob_out.proposals[0]));

        // Now encrypt something
        let msg = b"hello world";
        let ct = bob_group.encrypt_app_msg_nofail(msg);
        assert_eq!(charlie_group.decrypt_app_msg(&ct).unwrap(), msg);

        // Now test that we can decrypt messages out of order. We'll deliver a bunch of messages in
        // a totally random order
        let mut ciphertexts: Vec<_> =
            (0..core::cmp::min(OUT_OF_ORDER_TOLERANCE, MAX_MESSAGE_SEQ_JUMP))
                .map(|_| bob_group.encrypt_app_msg_nofail(msg))
                .collect();
        ciphertexts.shuffle(&mut rand::thread_rng());
        // Open the ciphertexts
        ciphertexts.into_iter().for_each(|ct| {
            charlie_group.decrypt_app_msg(&ct).unwrap();
        })
    }
}
