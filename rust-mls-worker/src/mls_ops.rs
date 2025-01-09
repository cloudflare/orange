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

        // Collect all the users in the group who will be the DC before me. This is simply all the
        // users who were in the group before my Welcome
        // Note: there is an optimization we're not doing. You can Welcome multiple people at once
        // in MLS. This requires a more careful definition of "before" for determining DC. We can
        // update it to mean "a user becomes DC before me iff the user was in the group prior to my
        // welcome, OR they were welcomed at the same time as me and have a lower leaf index". This
        // would require us to also send the list of UIDs being welcomed in every WelcomePackage,
        // and remove this set from our pending adds once we're welcomed. We can leave this for
        // future work. In practice, Welcomes almost never have more than 1 user in them anyway.
        let my_uid = self.uid();
        self.users_alive_before_i_was_welcomed = Some(
            self.mls_group
                .as_ref()
                .unwrap()
                .members()
                .filter_map(|m| {
                    let uid = m.credential.serialized_content().to_vec();
                    // Don't collect my own UID
                    if uid != my_uid {
                        Some(uid)
                    } else {
                        None
                    }
                })
                .collect(),
        );

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

        let uid = self.uid_as_str();
        let group = self.mls_group.as_mut().unwrap();

        // Process all the pending additions. This is drained, meaning the vec is empty after this
        println!(
            "{} Pending adds: {:?}",
            uid,
            self.pending_adds
                .iter()
                .map(|kp| String::from_utf8_lossy(kp_to_uid(kp)))
                .collect::<Vec<_>>()
        );
        let adds = self
            .pending_adds
            .drain(0..)
            .map(|kp| {
                let (add, welcome, _) = group
                    .add_members(
                        &self.mls_provider,
                        self.my_signing_keys.as_ref().unwrap(),
                        &[kp],
                    )
                    .expect("couldn't add user to group");

                // Merge the pending proposal we just made so we can export the new ratchet tree and
                // give it to the new user(s)
                group.merge_pending_commit(&self.mls_provider).unwrap();
                let ratchet_tree = group.export_ratchet_tree();

                let wp = WelcomePackageOut {
                    welcome,
                    ratchet_tree,
                };

                (wp, add)
            })
            .collect();

        // Now process the pending removes
        let remove = if !self.pending_removes.is_empty() {
            // Get the indices for all the users we're supposed to remove
            let uid_idx_map: BTreeMap<Vec<u8>, LeafNodeIndex> = group
                .members()
                .map(|member| {
                    (
                        member.credential.serialized_content().to_vec(),
                        member.index,
                    )
                })
                .collect();
            // Drain the pending removes. It's empty after this
            let pending_remove_idxs = self
                .pending_removes
                .drain(0..)
                .filter_map(|uid| uid_idx_map.get(&uid).copied())
                .collect::<Vec<_>>();

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

        WorkerResponse {
            adds,
            remove,
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
        if self.uid_as_str() == "Dave" {
            println!(
                "\t{}: Adding {} to pending adds",
                self.uid_as_str(),
                String::from_utf8_lossy(kp_to_uid(&user_kp))
            );
        }
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
        // If we haven't been welcomed, just ignore this message
        let Some(group) = self.mls_group.as_mut() else {
            return WorkerResponse::default();
        };

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
    /// Contains Welcomes and Adds for individual users. This must be processed in the same sequence
    /// as it appears
    pub(crate) adds: Vec<(WelcomePackageOut, MlsMessageOut)>,
    /// Contains an optional Remove operation. This might remove many users at once
    pub(crate) remove: Option<MlsMessageOut>,
    /// The new safety number for this group
    pub(crate) new_safety_number: Option<SafetyNumber>,
    /// The key package for a joining user
    pub(crate) key_pkg: Option<KeyPackage>,
    /// The ID of this user if it's the DC
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
    }

    impl TestRoom {
        /// Makes a new room whose first user has the given UID. Returns their user index (0)
        fn new(uid: &[u8]) -> (TestRoom, usize) {
            // Make a new state and start a group
            let (mut state, _) = WorkerState::new(uid.to_vec());
            state.start_group();

            (
                TestRoom {
                    states: vec![Some(state)],
                },
                0,
            )
        }

        /// User at the given index joins. Returns the DC's response and the new user's idx
        fn user_joins(&mut self, uid: &[u8]) -> (WorkerResponse, usize) {
            // Make the new user
            let (state, kp) = WorkerState::new(uid.to_vec());

            // Tell everyone alive that the user joined
            let mut responses = Vec::new();
            for state in self.states.iter_mut().filter(|s| s.is_some()) {
                let state = state.as_mut().unwrap();
                let resp = state.user_joined(key_pkg_out_to_in(kp.key_package()));
                // If this responses is non-empty, make sure it's the DC
                if !resp.adds.is_empty() || resp.remove.is_some() {
                    assert!(state.is_designated_committer());
                    // Also make sure it's only 1 add and 0 removes
                    assert_eq!(resp.adds.len(), 1);
                    assert!(resp.remove.is_none());
                }
                responses.push(resp);
            }

            // Add this state to the room states
            self.states.push(Some(state));

            // Make sure only 1 response is nonempty. This is the (new) DC
            let response_with_proposal = responses
                .iter()
                .position(|r| !r.adds.is_empty())
                .expect("no proposal was produced after a join");
            assert!(responses
                .iter()
                .enumerate()
                .all(|(i, r)| if i != response_with_proposal {
                    r.adds.is_empty() && r.remove.is_none() && r.key_pkg.is_none()
                } else {
                    true
                }));

            // Return the unique nonempty response
            let resp = core::mem::take(&mut responses[response_with_proposal]);
            let new_idx = self.states.len() - 1;

            (resp, new_idx)
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

            // Tell everyone alive that the user left
            let mut responses = Vec::new();
            for state in self.states.iter_mut().filter(|s| s.is_some()) {
                let state = state.as_mut().unwrap();
                let resp = state.user_left(&uid_to_remove);
                // If this responses is non-empty, make sure it's the DC
                if !resp.adds.is_empty() || resp.remove.is_some() {
                    assert!(state.is_designated_committer());
                }
                responses.push(resp);
            }

            // Make sure only 1 response is nonempty. This is the (new) DC
            let response_with_proposal = responses
                .iter()
                .position(|r| r.remove.is_some())
                .expect("no proposal was produced after a leave");
            assert!(responses
                .iter()
                .enumerate()
                .all(|(i, r)| if i != response_with_proposal {
                    r.adds.is_empty() && r.remove.is_none() && r.key_pkg.is_none()
                } else {
                    true
                }));

            // Return the unique nonempty response
            core::mem::take(&mut responses[response_with_proposal])
        }

        /// Welcomes the joining user with the given worker response
        fn user_accepts_welcome(&mut self, idx: usize, resp: &WorkerResponse) {
            // Let the user try to accept every welcome. Only the one intended  for them will work
            for (welcome, _) in &resp.adds {
                let wp = welcome_out_to_in(welcome);
                self.states[idx].as_mut().map(|s| s.join_group(wp));
            }
        }

        /// Has the user at the given index process the commits in the given worker repsonse
        fn user_processes_commits(&mut self, idx: usize, resp: &WorkerResponse) {
            // Process adds
            for (_, add) in &resp.adds {
                if let Some(ref mut s) = self.states[idx] {
                    s.handle_commit(msg_out_to_in(add));
                }
            }
            // Process remove
            if let Some(remove) = resp.remove.as_ref() {
                if let Some(ref mut s) = self.states[idx] {
                    s.handle_commit(msg_out_to_in(remove));
                }
            };
        }

        /// All users in the room process the welcome, adds, and remove of the given response
        fn all_users_process_catch_up(&mut self, resp: &WorkerResponse) {
            for state in self.states.iter_mut() {
                let Some(ref mut s) = state else {
                    continue;
                };
                println!("{} catching up", s.uid_as_str());

                // Process welcomes and adds
                for (welcome, add) in &resp.adds {
                    let wp = welcome_out_to_in(welcome);
                    // Join if possible
                    s.join_group(wp);
                    // Process the add if possible
                    s.handle_commit(msg_out_to_in(add));
                }
                // Process remove
                if let Some(remove) = resp.remove.as_ref() {
                    s.handle_commit(msg_out_to_in(remove));
                };
                println!("Done");
            }
        }

        /// Does a bunch of encryptions/decryptions of applications messages between parties in this group
        fn test_app_msg_encryption(&mut self, rng: &mut impl Rng) {
            let msg = b"hello world";

            // Pick a distinct sender and receiver at random
            let sender_idx = loop {
                let idx: usize = rng.gen_range(0..self.states.len());
                // Only select states of users that have been welcomed
                if self.states[idx]
                    .as_ref()
                    .map(|s| s.mls_group.is_some())
                    .unwrap_or(false)
                {
                    break idx;
                }
            };
            let receiver_idx = loop {
                let idx: usize = rng.gen_range(0..self.states.len());
                if self.states[idx]
                    .as_ref()
                    .map(|s| s.mls_group.is_some())
                    .unwrap_or(false)
                    && idx != sender_idx
                {
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

    #[test]
    fn normal_join_leave() {
        let mut rng = rand::thread_rng();

        // Alice is the first member
        let (mut room, alice_idx) = TestRoom::new(b"Alice");

        // Alice adds Bob
        let (msg, bob_idx) = room.user_joins(b"Bob");
        room.user_accepts_welcome(bob_idx, &msg);

        // Alice adds Charlie
        let (msg, charlie_idx) = room.user_joins(b"Charlie");
        room.user_accepts_welcome(charlie_idx, &msg);
        room.user_processes_commits(bob_idx, &msg);

        // Alice leaves. Everyone removes her
        let msg = room.user_leaves(alice_idx);
        room.user_processes_commits(bob_idx, &msg);
        room.user_processes_commits(charlie_idx, &msg);

        room.test_app_msg_encryption(&mut rng);
    }

    #[test]
    fn multi_pending() {
        let mut rng = rand::thread_rng();

        // Alice is the first member
        let (mut room, alice_idx) = TestRoom::new(b"Alice");

        // Alice adds Bob
        let (msg, bob_idx) = room.user_joins(b"Bob");
        room.all_users_process_catch_up(&msg);
        //room.user_accepts_welcome(bob_idx, &msg);

        // Charlie and Dave join, but Alice isn't responding
        let (_, charlie_idx) = room.user_joins(b"Charlie");
        let (_, _dave_idx) = room.user_joins(b"Dave");

        // Alice leaves, making Bob the DC. Bob welcomes Charlie and Dave
        let msg = room.user_leaves(alice_idx);
        room.all_users_process_catch_up(&msg);
        //room.user_accepts_welcome(charlie_idx, &msg);
        //room.user_accepts_welcome(dave_idx, &msg);
        //room.user_processes_commits(bob_idx, &msg);
        //room.user_processes_commits(charlie_idx, &msg);
        //room.user_processes_commits(dave_idx, &msg);
        room.test_app_msg_encryption(&mut rng);

        // Eve joins. Charlie and Dave process Bob's Add
        let (msg, _eve_idx) = room.user_joins(b"Eve");
        room.all_users_process_catch_up(&msg);
        //room.user_accepts_welcome(eve_idx, &msg);
        //room.user_processes_commits(bob_idx, &msg);
        //room.user_processes_commits(charlie_idx, &msg);
        //room.user_processes_commits(dave_idx, &msg);
        //room.user_processes_commits(eve_idx, &msg);

        // Charlie leaves. Bob is still the DC
        let msg = room.user_leaves(charlie_idx);
        room.all_users_process_catch_up(&msg);
        //room.user_processes_commits(bob_idx, &msg);
        //room.user_processes_commits(charlie_idx, &msg);
        //room.user_processes_commits(dave_idx, &msg);
        //room.user_processes_commits(eve_idx, &msg);

        // Bob leaves. Dave is the DC
        let msg = room.user_leaves(bob_idx);
        room.all_users_process_catch_up(&msg);
        //room.user_processes_commits(bob_idx, &msg);
        //room.user_processes_commits(charlie_idx, &msg);
        //room.user_processes_commits(dave_idx, &msg);
        //room.user_processes_commits(eve_idx, &msg);

        room.test_app_msg_encryption(&mut rng);
    }
}
