use std::{
    collections::{BTreeMap, BTreeSet},
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
    /// The UIDs of the users who were in the MLS group before this user was welcomed. These are
    /// precisely the ones who would be a designated committer before this user. This is only
    /// `Some` once this user has been welcomed
    users_alive_before_i_was_welcomed: Option<BTreeSet<Vec<u8>>>,
    /// The UIDs of the users who left the room after this user joined the room (not necessarily was
    /// added)
    users_who_left_since_i_joined: BTreeSet<Vec<u8>>,
    /// The set of room members who have not yet been added to the MLS group
    pending_adds: Vec<KeyPackage>,
    /// The set of UIDs of room members who have not yet been removed from the MLS group
    pending_removes: Vec<Vec<u8>>,
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

    /// Returns whether this user is the designated committer (DC) of the group
    fn is_designated_committer(&self) -> bool {
        // If everyone who was alive when I was welcomed is now dead, then I'm the DC
        if let Some(alive_at_welcome) = &self.users_alive_before_i_was_welcomed {
            let other_dc_candiates =
                alive_at_welcome.difference(&self.users_who_left_since_i_joined);
            other_dc_candiates.count() == 0
        } else {
            // If I haven't been welcomed, I'm certainly not the DC
            false
        }
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

        // Starting a group means you don't have to be Welcomed
        self.users_alive_before_i_was_welcomed = Some(BTreeSet::new());

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
        } else {
            panic!("expected Welcome message in join_group")
        }

        // Collect all the users in the group who will be the DC before me
        // This includes users who were included in the same Welcome that welcomed me
        let my_leaf_idx = self.mls_group.as_ref().unwrap().own_leaf_index();
        self.users_alive_before_i_was_welcomed = Some(
            self.mls_group
                .as_ref()
                .unwrap()
                .members()
                .filter_map(|m| {
                    if m.index < my_leaf_idx {
                        let uid = m.credential.serialized_content().to_vec();
                        Some(uid)
                    } else {
                        None
                    }
                })
                .collect(),
        );

        // We also don't need to add users who were part of our Welcome. Remove them from our
        // pendings
        let users_in_tree: BTreeSet<Vec<u8>> = self
            .mls_group
            .as_ref()
            .unwrap()
            .members()
            .map(|m| m.credential.serialized_content().to_vec())
            .collect();
        self.pending_adds
            .retain(|kp| !users_in_tree.contains(kp_to_uid(kp)));

        // Return the new safety number
        WorkerResponse {
            new_safety_number: Some(self.safety_number()),
            ..Default::default()
        }
    }

    /// If this user is the designated committer, this catches up on the pending adds and removes.
    /// If not, this does nothing.
    fn process_pendings(&mut self) -> WorkerResponse {
        if !self.is_designated_committer() {
            return WorkerResponse::default();
        }

        let group = self.mls_group.as_mut().unwrap();

        // Process all the pending additions
        let (additions, welcome) = if !self.pending_adds.is_empty() {
            let (additions, welcome, _) = group
                .add_members(
                    &self.mls_provider,
                    self.my_signing_keys.as_ref().unwrap(),
                    &self.pending_adds,
                )
                .expect("couldn't add user to group");

            (Some(additions), Some(welcome))
        } else {
            (None, None)
        };

        // Merge the pending proposal we just made so we can export the new ratchet tree and
        // give it to the new user(s)
        group.merge_pending_commit(&self.mls_provider).unwrap();
        let ratchet_tree = group.export_ratchet_tree();

        // Now process the pending removes
        let removal = if !self.pending_removes.is_empty() {
            // Get the indices for all the users we're supposed to remove
            let pending_remove_idxs = {
                let uid_idx_map: BTreeMap<Vec<u8>, LeafNodeIndex> = group
                    .members()
                    .map(|member| {
                        (
                            member.credential.serialized_content().to_vec(),
                            member.index,
                        )
                    })
                    .collect();
                self.pending_removes
                    .iter()
                    .filter_map(|uid| uid_idx_map.get(uid).copied())
                    .collect::<Vec<_>>()
            };

            // Remove them
            let (commit, _, _) = group
                .remove_members(
                    &self.mls_provider,
                    self.my_signing_keys.as_ref().unwrap(),
                    &pending_remove_idxs,
                )
                .expect("could not remove user");
            Some(commit)
        } else {
            None
        };
        group.merge_pending_commit(&self.mls_provider).unwrap();

        // Make a vec of the adds and removes
        let proposals = additions.into_iter().chain(removal).collect();

        // Clear the pendings now that they've been processed
        self.pending_adds.clear();
        self.pending_removes.clear();

        WorkerResponse {
            welcome: welcome.map(|w| WelcomePackageOut {
                welcome: w,
                ratchet_tree,
            }),
            proposals,
            new_safety_number: Some(self.safety_number()),
            sender_id: Some(self.uid_as_str()),
            ..Default::default()
        }
    }

    /// If this user is the Designated Committer, this will create a welcome package for the for the
    /// new user and a Commit with an Add operation in it, and it will update the current state to
    /// include the Add. Otherwise, this will just note that a new user has joined the room but not
    /// yet been added to the MLS group.
    fn user_joined(&mut self, user_kp: KeyPackageIn) -> WorkerResponse {
        // Extract the new user's key package
        let user_kp = user_kp
            .validate(self.mls_provider.crypto(), PROT_VERSION)
            .unwrap();
        // Add the user to the pending list
        self.pending_adds.push(user_kp);

        // Process pending adds/removes (only does anything if we're the DC)
        self.process_pendings()
    }

    /// If this user is the Designated Committer, this will create a Remove message
    /// for the rest of the group. Otherwise, this will just note that a user has been
    /// removed from the room,  but not yet been removed from the MLS group.
    /// If this user has not yet been welcomed, they add this to the pending removes and log the UID
    /// as one they will not consider a DC candidate.
    /// This will panic if a user tries to remove themselves.
    fn user_left(&mut self, uid_to_remove: &[u8]) -> WorkerResponse {
        if uid_to_remove == self.uid() {
            panic!("cannot remove self");
        }

        // Add this user to the pending removes
        self.pending_removes.push(uid_to_remove.to_vec());
        // Mark this user as left
        self.users_who_left_since_i_joined
            .insert(uid_to_remove.to_vec());

        // Process pending adds/removes (only does anything if we're the DC)
        self.process_pendings()
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
            // Collect all the UIDs of the users being added and removed
            let uids_being_added: BTreeSet<_> = staged_com
                .add_proposals()
                .map(|p| kp_to_uid(p.add_proposal().key_package()).to_vec())
                .collect();
            let uids_being_removed: BTreeSet<_> = staged_com
                .remove_proposals()
                .filter_map(|p| {
                    let idx = p.remove_proposal().removed();
                    group
                        .member(idx)
                        .map(|cred| cred.serialized_content().to_vec())
                })
                .collect();

            // Merge the Commit into the group state
            group
                .merge_staged_commit(&self.mls_provider, *staged_com)
                .expect("couldn't merge commit");

            // After successful add, remove the UIDs from the pending list. In other words, retain
            // the UIDs that aren't in the pending list
            self.pending_adds
                .retain(|kp| !uids_being_added.contains(kp_to_uid(kp)));
            // Same thing for removes
            self.pending_removes
                .retain(|uid| !uids_being_removed.contains(uid));

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
        .try_with(|mutex| {
            mutex
                .lock()
                .expect("couldn't lock mutex")
                .user_joined(key_pkg)
        })
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
                .user_left(uid_bytes)
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
    use rand::{seq::SliceRandom, Rng};

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

    #[derive(Default)]
    struct TestRoom {
        /// Users states. If the user has left, this is None
        states: Vec<Option<WorkerState>>,
        key_pkgs: Vec<KeyPackageBundle>,
    }

    impl TestRoom {
        /// Makes a new user and returns their index
        fn new_user(&mut self, uid: &[u8]) -> usize {
            let (state, kp) = WorkerState::new(uid.to_vec());
            self.states.push(Some(state));
            self.key_pkgs.push(kp);

            self.states.len() - 1
        }

        /// User at the given idx starts the group
        fn start(&mut self, idx: usize) {
            self.states[idx].as_mut().unwrap().start_group();
        }

        /// User at the given index joins
        fn user_joins(&mut self, idx: usize) -> WorkerResponse {
            let key_pkg = key_pkg_out_to_in(self.key_pkgs[idx].key_package());
            let mut responses = Vec::new();
            // Tell everyone that the user joined
            for (i, state) in self.states.iter_mut().enumerate() {
                if i == idx {
                    continue;
                }

                if let Some(ref mut s) = state {
                    let resp = s.user_joined(key_pkg.clone());
                    // If this responses is non-empty, make sure it's the DC
                    if resp.welcome.is_some() || !resp.proposals.is_empty() {
                        assert!(s.is_designated_committer());
                        // Also make sure it's only 1 proposal, the Add
                        assert_eq!(resp.proposals.len(), 1);
                    }
                    responses.push(resp);
                };
            }

            // Make sure only 1 response is nonempty. This is the (new) DC
            let response_with_proposal = responses
                .iter()
                .position(|r| !r.proposals.is_empty())
                .expect("no proposal was produced after a join");
            assert!(responses
                .iter()
                .enumerate()
                .all(|(i, r)| if i != response_with_proposal {
                    r.welcome.is_none() && r.key_pkg.is_none() && r.proposals.is_empty()
                } else {
                    true
                }));

            // Return the unique nonempty response
            core::mem::take(&mut responses[response_with_proposal])
        }

        /// User at the given index leaves
        fn user_leaves(&mut self, idx: usize) -> WorkerResponse {
            let uid_to_remove = self.states[idx]
                .as_ref()
                .unwrap()
                .my_credential
                .as_ref()
                .unwrap()
                .credential
                .serialized_content()
                .to_vec();
            // Clear the removed user's state
            self.states[idx] = None;

            // Tell everyone that the user left
            let mut responses = Vec::new();
            for (i, state) in self.states.iter_mut().enumerate() {
                if i == idx {
                    continue;
                }

                if let Some(ref mut s) = state {
                    let resp = s.user_left(&uid_to_remove);
                    // If this responses is non-empty, make sure it's the DC
                    if resp.welcome.is_some() || !resp.proposals.is_empty() {
                        assert!(s.is_designated_committer());
                    }
                    responses.push(resp);
                };
            }

            // Make sure only 1 response is nonempty. This is the (new) DC
            let response_with_proposal = responses
                .iter()
                .position(|r| !r.proposals.is_empty())
                .expect("no proposal was produced after a leave");
            assert!(responses
                .iter()
                .enumerate()
                .all(|(i, r)| if i != response_with_proposal {
                    r.welcome.is_none() && r.key_pkg.is_none() && r.proposals.is_empty()
                } else {
                    true
                }));

            // Return the unique nonempty response
            core::mem::take(&mut responses[response_with_proposal])
        }

        /// Welcomes the joining user with the given worker response
        fn user_accepts_welcome(&mut self, idx: usize, resp: &WorkerResponse) {
            let wp = welcome_out_to_in(resp.welcome.as_ref().unwrap());
            self.states[idx].as_mut().map(|s| s.join_group(wp));
        }

        /// Has the user at the given index process the commits in the given worker repsonse
        fn user_processes_commits(&mut self, idx: usize, resp: &WorkerResponse) {
            for proposal in resp.proposals.iter().map(msg_out_to_in) {
                if let Some(ref mut s) = self.states[idx] {
                    s.handle_commit(proposal);
                }
            }
        }

        /// Does a bunch of encryptions/decryptions of applications messages between parties in this group
        fn test_app_msg_encryption(&mut self, rng: &mut impl Rng) {
            let msg = b"hello world";

            for _ in 0..1 {
                // Pick a distinct sender and receiver at random
                let sender_idx = loop {
                    let idx: usize = rng.gen_range(0..self.states.len());
                    if self.states[idx].is_some() {
                        break idx;
                    }
                };
                let receiver_idx = loop {
                    let idx: usize = rng.gen_range(0..self.states.len());
                    if self.states[idx].is_some() && idx != sender_idx {
                        break idx;
                    }
                };

                // Take the sender and receiver states
                let mut sender = core::mem::take(&mut self.states[sender_idx]);
                let mut receiver = core::mem::take(&mut self.states[receiver_idx]);

                // Test that we can decrypt messages out of order. We'll deliver a bunch of messages in
                // a totally random order
                let mut ciphertexts: Vec<_> =
                    (0..core::cmp::min(OUT_OF_ORDER_TOLERANCE, MAX_MESSAGE_SEQ_JUMP))
                        .map(|_| sender.as_mut().unwrap().encrypt_app_msg_nofail(msg))
                        .collect();
                ciphertexts.shuffle(&mut rand::thread_rng());
                // Open the ciphertexts
                ciphertexts.into_iter().for_each(|ct| {
                    receiver.as_mut().unwrap().decrypt_app_msg(&ct).unwrap();
                });

                // Set the sender and receiver states back where they were
                self.states[sender_idx] = sender;
                self.states[receiver_idx] = receiver;
            }
        }
    }

    #[test]
    fn new_normal_join_leave() {
        let mut rng = rand::thread_rng();
        let mut room = TestRoom::default();

        let alice_idx = room.new_user(b"Alice");
        let bob_idx = room.new_user(b"Bob");
        let charlie_idx = room.new_user(b"Charlie");

        // Alice is the first member
        room.start(alice_idx);

        // Alice adds Bob
        let msg = room.user_joins(bob_idx);
        room.user_accepts_welcome(bob_idx, &msg);

        // Alice adds Charlie
        let msg = room.user_joins(charlie_idx);
        room.user_accepts_welcome(charlie_idx, &msg);
        room.user_processes_commits(bob_idx, &msg);

        // Alice leaves. Everyone removes her
        let msg = room.user_leaves(alice_idx);
        room.user_processes_commits(bob_idx, &msg);
        room.user_processes_commits(charlie_idx, &msg);

        room.test_app_msg_encryption(&mut rng);
    }

    #[test]
    fn normal_join_leave() {
        let (mut alice_group, _alice_key_pkg) = WorkerState::new(b"Alice".to_vec());
        let (mut bob_group, bob_key_pkg) = WorkerState::new(b"Bob".to_vec());
        let (mut charlie_group, charlie_key_pkg) = WorkerState::new(b"Charlie".to_vec());

        // Alice starts the group
        alice_group.start_group();

        // Alice adds Bob
        let add_op = alice_group.user_joined(key_pkg_out_to_in(bob_key_pkg.key_package()));
        // The Add op is a welcome package and 1 proposal
        assert!(add_op.welcome.is_some());
        assert_eq!(add_op.proposals.len(), 1);

        // Pretend Bob parsed the welcome package
        let wp = welcome_out_to_in(add_op.welcome.as_ref().unwrap());
        // Bob joins the group
        bob_group.join_group(wp);

        // Now Alice adds Charlie
        let add_op = alice_group.user_joined(key_pkg_out_to_in(charlie_key_pkg.key_package()));
        // Bob sees that the Add came in but Alice hasn't sent a proposal yet
        bob_group.user_joined(key_pkg_out_to_in(charlie_key_pkg.key_package()));
        // Pretend Bob parsed the Add and Charlie parsed the welcome package
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
        let bob_out = bob_group.user_left(b"Alice");
        let charlie_out = charlie_group.user_left(b"Alice");
        // Bob is the DC, so Charlie's output should be empty
        assert!(bob_group.is_designated_committer());
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

    #[test]
    fn new_multi_pending() {
        let mut rng = rand::thread_rng();
        let mut room = TestRoom::default();

        let alice_idx = room.new_user(b"Alice");
        let bob_idx = room.new_user(b"Bob");
        let charlie_idx = room.new_user(b"Charlie");
        let dave_idx = room.new_user(b"Dave");
        let eve_idx = room.new_user(b"Eve");

        // Alice is the first member
        room.start(alice_idx);

        // Alice adds Bob
        let msg = room.user_joins(bob_idx);
        room.user_accepts_welcome(bob_idx, &msg);

        // Charlie and Dave join, but Alice isn't responding
        room.user_joins(charlie_idx);
        room.user_joins(dave_idx);

        // Alice leaves, making Bob the DC. Bob welcomes Charlie and Dave
        let msg = room.user_leaves(alice_idx);
        room.user_accepts_welcome(charlie_idx, &msg);
        room.user_accepts_welcome(dave_idx, &msg);

        // Eve joins. Charlie and Dave process Bob's Add
        let msg = room.user_joins(eve_idx);
        room.user_accepts_welcome(eve_idx, &msg);
        room.user_processes_commits(charlie_idx, &msg);
        room.user_processes_commits(dave_idx, &msg);

        // Charlie leaves. Bob is still the DC
        let msg = room.user_leaves(charlie_idx);
        room.user_processes_commits(dave_idx, &msg);
        room.user_processes_commits(eve_idx, &msg);

        // Bob leaves. Dave is the DC
        let msg = room.user_leaves(bob_idx);
        room.user_processes_commits(dave_idx, &msg);
        room.user_processes_commits(eve_idx, &msg);

        room.test_app_msg_encryption(&mut rng);
    }

    // Tests the case where there are more than one pending adds
    #[test]
    fn multi_pending() {
        let (mut alice_group, _alice_key_pkg) = WorkerState::new(b"Alice".to_vec());
        let (mut bob_group, bob_key_pkg) = WorkerState::new(b"Bob".to_vec());
        let (mut charlie_group, charlie_key_pkg) = WorkerState::new(b"Charlie".to_vec());
        let (mut dave_group, dave_key_pkg) = WorkerState::new(b"Dave".to_vec());

        // Alice starts the group
        alice_group.start_group();

        // Alice adds Bob
        let add_op = alice_group.user_joined(key_pkg_out_to_in(bob_key_pkg.key_package()));
        // The Add op is a welcome package and 1 proposal

        // Pretend Bob parsed the welcome package
        let wp = welcome_out_to_in(add_op.welcome.as_ref().unwrap());
        // Bob joins the group
        bob_group.join_group(wp);

        // Now say Charlie and Dave join, but Alice doesn't add them because she's dead
        bob_group.user_joined(key_pkg_out_to_in(charlie_key_pkg.key_package()));
        bob_group.user_joined(key_pkg_out_to_in(dave_key_pkg.key_package()));
        charlie_group.user_joined(key_pkg_out_to_in(dave_key_pkg.key_package()));
        // Alice officially dies. This makes Bob the DC. Charlie and Dave haven't been Welcomed yet
        let bob_out = bob_group.user_left(b"Alice");
        let charlie_out = charlie_group.user_left(b"Alice");
        let dave_out = dave_group.user_left(b"Alice");
        // Bob's output should be an Add and Remove proposal. Also a Welcome
        assert_eq!(bob_out.proposals.len(), 2);
        assert!(bob_out.welcome.is_some());
        assert!(charlie_out.proposals.is_empty());
        assert!(dave_out.proposals.is_empty());

        let wp = welcome_out_to_in(bob_out.welcome.as_ref().unwrap());
        let wp_clone = welcome_out_to_in(bob_out.welcome.as_ref().unwrap());
        // Charlie and Dave join the group
        charlie_group.join_group(wp);
        dave_group.join_group(wp_clone);
        // They both then process the Add (does nothing for them) and remove
        for proposal in bob_out.proposals.iter().map(msg_out_to_in) {
            charlie_group.handle_commit(proposal.clone());
            dave_group.handle_commit(proposal);
        }

        // Okay now Bob dies. Make sure Charlie knows he's the DC
        let charlie_out = charlie_group.user_left(b"Bob");
        let dave_out = dave_group.user_left(b"Bob");
        assert!(charlie_group.is_designated_committer());
        assert_eq!(charlie_out.proposals.len(), 1);
        assert!(!dave_group.is_designated_committer());
        assert!(dave_out.proposals.is_empty());
        dave_group.handle_commit(msg_out_to_in(&charlie_out.proposals[0]));

        // Now Charlie dies. Make sure Dave knows he's the DC
    }
}
