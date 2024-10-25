use std::{
    collections::BTreeSet,
    sync::{Arc, Mutex},
};

use openmls::{
    group::{MlsGroup, MlsGroupCreateConfig, MlsGroupJoinConfig, StagedWelcome},
    prelude::{
        ApplicationMessage, BasicCredential, Ciphersuite, CredentialWithKey, DeserializeBytes,
        KeyPackage, KeyPackageBundle, LeafNodeIndex, MlsMessageBodyIn, MlsMessageIn, MlsMessageOut,
        OpenMlsProvider, ProcessedMessageContent,
    },
};
use openmls_basic_credential::SignatureKeyPair;
use openmls_rust_crypto::OpenMlsRustCrypto;

const CIPHERSUITE: Ciphersuite = Ciphersuite::MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519;

#[derive(Default)]
struct WorkerState {
    mls_provider: OpenMlsRustCrypto,
    mls_group: Option<MlsGroup>,
    is_designated_committer: Option<bool>,
    my_credential: Option<CredentialWithKey>,
    my_signing_keys: Option<SignatureKeyPair>,
    room_members: BTreeSet<Vec<u8>>,
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
    fn join_group(&mut self, welcome: MlsMessageIn) {
        // Process the message
        if let MlsMessageBodyIn::Welcome(w) = welcome.extract() {
            let staged_join = StagedWelcome::new_from_welcome(
                &self.mls_provider,
                &MlsGroupJoinConfig::default(),
                w,
                None,
            )
            .expect("could not stage welcome");

            // Create a group from the processed welcome
            self.mls_group = Some(
                staged_join
                    .into_group(&self.mls_provider)
                    .expect("error joining group"),
            );
        } else {
            panic!("expected welcome package in join_group")
        }
    }

    /// If this user is the Designated Committer, this will create a Welcome package for the for the
    /// new user and a Commit with an Add operation in it. Otherwise, this will just note that a new
    /// user has joined the room but not yet been added to the MLS group
    fn add_user(&mut self, user_keys: KeyPackage) -> Option<(MlsMessageOut, MlsMessageOut)> {
        let uid = user_keys.leaf_node().credential().serialized_content();

        if self.is_designated_committer.unwrap() {
            let (commit, welcome, _) = self
                .mls_group
                .as_mut()
                .unwrap()
                .add_members(
                    &self.mls_provider,
                    self.my_signing_keys.as_ref().unwrap(),
                    &[user_keys],
                )
                .expect("couldn't add user to group");

            Some((welcome, commit))
        } else {
            self.room_members.insert(uid.to_vec());
            None
        }
    }

    /// If this user is the Designated Committer, this will create a Remove message
    /// for the rest of the group. Otherwise, this will just note that a user has been
    /// removed from the room,  but not yet been removed from the MLS group
    fn remove_user(&mut self, uid: &[u8]) -> Option<MlsMessageOut> {
        let group = self.mls_group.as_mut().unwrap();

        // Check if this removal turns me into the Designated Committer
        // Do a linear search through the set of users to find the one with the given UID
        let removed_leaf_idx = group
            .members()
            .position(|member| member.credential.serialized_content() == uid)
            .expect("could not find user in tree") as u32;
        let my_leaf_idx = group.own_leaf_index().u32();
        let exists_other_designee =
            (removed_leaf_idx..my_leaf_idx).any(|i| group.member(LeafNodeIndex::new(i)).is_some());
        if !exists_other_designee {
            self.is_designated_committer = Some(true);
        }

        if self.is_designated_committer.unwrap() {
            // Do the removal operation and return the Commit
            let (msg_out, _, _) = group
                .remove_members(
                    &self.mls_provider,
                    self.my_signing_keys.as_ref().unwrap(),
                    &[LeafNodeIndex::new(removed_leaf_idx as u32)],
                )
                .expect("could not remove user");
            Some(msg_out)
        } else {
            unimplemented!();
            None
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
            // Merge the Commit into the group state
            group
                .merge_staged_commit(&self.mls_provider, *staged_com)
                .expect("couldn't merge commit");
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
