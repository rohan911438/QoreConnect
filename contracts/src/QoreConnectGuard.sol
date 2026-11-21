// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @notice QoreChain PQC precompiles (testnet). ABI from @qorechain/evm IQORE_PQC_ABI.
interface IQorePQC {
    function pqcVerify(bytes calldata pubkey, bytes calldata signature, bytes calldata message)
        external
        view
        returns (bool valid);

    function pqcKeyStatus(address account) external view returns (bool registered, uint8 algorithmId, bytes memory pubkey);
}

/// @title QoreConnectGuard
/// @notice A vault for one QoreConnect account. Small withdrawals work with any key the account allows (for example the
///         MetaMask session key, through the relayer). Withdrawals above `threshold` additionally need an ML-DSA-87
///         signature from the account's quantum-safe root key, checked on-chain with the `pqcVerify` precompile against
///         the key registered for the owner (`pqcKeyStatus`). A broken classical key alone cannot move large amounts.
contract QoreConnectGuard {
    address public constant PQC_VERIFY = 0x0000000000000000000000000000000000000a01;
    address public constant PQC_KEY_STATUS = 0x0000000000000000000000000000000000000a02;

    /// @notice The QoreConnect account (0x form of the root's qor1 address).
    address public immutable owner;
    /// @notice Largest withdrawal that does not need a root signature (wei).
    uint256 public threshold;
    /// @notice Root-signed operation counter (replay protection).
    uint256 public nonce;

    bool private locked;

    event Deposited(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount, bool rootSigned);
    event ThresholdChanged(uint256 oldThreshold, uint256 newThreshold);

    error NotOwner();
    error OverThreshold(uint256 amount, uint256 threshold);
    error RootKeyNotRegistered();
    error BadRootSignature();
    error InsufficientBalance();
    error TransferFailed();
    error Reentrancy();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        if (locked) revert Reentrancy();
        locked = true;
        _;
        locked = false;
    }

    constructor(address owner_, uint256 threshold_) {
        owner = owner_;
        threshold = threshold_;
    }

    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    function deposit() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    /// @notice Withdraw up to `threshold` with any key the account allows.
    function withdraw(address payable to, uint256 amount) external onlyOwner nonReentrant {
        if (amount > threshold) revert OverThreshold(amount, threshold);
        _send(to, amount, false);
    }

    /// @notice Withdraw any amount with an ML-DSA-87 signature from the root over `withdrawDigest(to, amount, nonce)`.
    function withdrawWithRoot(address payable to, uint256 amount, bytes calldata rootSignature)
        external
        onlyOwner
        nonReentrant
    {
        _checkRoot(withdrawDigest(to, amount, nonce), rootSignature);
        nonce++;
        _send(to, amount, true);
    }

    /// @notice Change the threshold; always needs the root signature (a classical key cannot raise its own cap).
    function setThreshold(uint256 newThreshold, bytes calldata rootSignature) external onlyOwner {
        _checkRoot(thresholdDigest(newThreshold, nonce), rootSignature);
        nonce++;
        emit ThresholdChanged(threshold, newThreshold);
        threshold = newThreshold;
    }

    /// @notice The exact bytes the root signs for a large withdrawal (bound to chain, contract and nonce).
    function withdrawDigest(address to, uint256 amount, uint256 nonce_) public view returns (bytes memory) {
        return abi.encode("QoreConnectGuard.withdraw", block.chainid, address(this), to, amount, nonce_);
    }

    /// @notice The exact bytes the root signs to change the threshold.
    function thresholdDigest(uint256 newThreshold, uint256 nonce_) public view returns (bytes memory) {
        return abi.encode("QoreConnectGuard.threshold", block.chainid, address(this), newThreshold, nonce_);
    }

    /// @notice The owner's registered post-quantum public key (empty when not registered).
    function rootPublicKey() public view returns (bytes memory) {
        (bool registered,, bytes memory pubkey) = IQorePQC(PQC_KEY_STATUS).pqcKeyStatus(owner);
        if (!registered || pubkey.length == 0) return "";
        return pubkey;
    }

    function _checkRoot(bytes memory message, bytes calldata signature) private view {
        bytes memory pubkey = rootPublicKey();
        if (pubkey.length == 0) revert RootKeyNotRegistered();
        if (!IQorePQC(PQC_VERIFY).pqcVerify(pubkey, signature, message)) revert BadRootSignature();
    }

    function _send(address payable to, uint256 amount, bool rootSigned) private {
        if (amount > address(this).balance) revert InsufficientBalance();
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(to, amount, rootSigned);
    }
}
