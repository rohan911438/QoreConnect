// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @title QoreTipJar
/// @notice A small tip jar used by the QoreConnect demo: anyone tips a creator with a short note, the creator withdraws.
///         Chosen so the demo shows real value moving through MetaMask + relayer, within the account's spending rules.
contract QoreTipJar {
    uint256 public constant MAX_NOTE_BYTES = 140;

    /// @notice Withdrawable balance per creator.
    mapping(address => uint256) public balanceOf;
    /// @notice Lifetime tips received per creator (never decreases).
    mapping(address => uint256) public totalReceived;
    /// @notice Number of tips received per creator.
    mapping(address => uint256) public tipCount;
    /// @notice Sum of all tips ever sent through the jar.
    uint256 public totalTipped;

    bool private locked;

    event Tipped(address indexed from, address indexed creator, uint256 amount, string note);
    event Withdrawn(address indexed creator, address indexed to, uint256 amount);

    error ZeroTip();
    error ZeroCreator();
    error NoteTooLong(uint256 length);
    error NothingToWithdraw();
    error TransferFailed();
    error Reentrancy();

    modifier nonReentrant() {
        if (locked) revert Reentrancy();
        locked = true;
        _;
        locked = false;
    }

    function tip(address creator, string calldata note) external payable {
        if (msg.value == 0) revert ZeroTip();
        if (creator == address(0)) revert ZeroCreator();
        if (bytes(note).length > MAX_NOTE_BYTES) revert NoteTooLong(bytes(note).length);
        balanceOf[creator] += msg.value;
        totalReceived[creator] += msg.value;
        tipCount[creator] += 1;
        totalTipped += msg.value;
        emit Tipped(msg.sender, creator, msg.value, note);
    }

    /// @notice Withdraw the caller's whole balance to the caller.
    function withdraw() external {
        _withdraw(payable(msg.sender));
    }

    /// @notice Withdraw the caller's whole balance to another address.
    function withdrawTo(address payable to) external {
        if (to == address(0)) revert ZeroCreator();
        _withdraw(to);
    }

    function _withdraw(address payable to) private nonReentrant {
        uint256 amount = balanceOf[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        balanceOf[msg.sender] = 0;
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(msg.sender, to, amount);
    }
}
