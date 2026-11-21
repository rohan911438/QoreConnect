// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {QoreConnectGuard} from "../src/QoreConnectGuard.sol";

/// Mock pqcKeyStatus: per-account registration and public key.
contract MockKeyStatus {
    mapping(address => bytes) public keys;

    function set(address a, bytes calldata k) external {
        keys[a] = k;
    }

    function pqcKeyStatus(address account) external view returns (bool, uint8, bytes memory) {
        bytes memory k = keys[account];
        return (k.length > 0, k.length > 0 ? 3 : 0, k);
    }
}

/// Mock pqcVerify: a "signature" is valid iff it equals keccak256(pubkey, message) (stands in for ML-DSA-87).
contract MockVerify {
    function pqcVerify(bytes calldata pubkey, bytes calldata signature, bytes calldata message)
        external
        pure
        returns (bool)
    {
        return keccak256(signature) == keccak256(abi.encodePacked(keccak256(abi.encodePacked(pubkey, message))));
    }
}

contract QoreConnectGuardTest is Test {
    QoreConnectGuard guard;
    address owner = makeAddr("qoreconnect-account");
    address payable to = payable(makeAddr("to"));
    bytes pubkey = hex"a1b2c3d4e5";

    function sign(bytes memory k, bytes memory message) internal pure returns (bytes memory) {
        return abi.encodePacked(keccak256(abi.encodePacked(k, message)));
    }

    function setUp() public {
        vm.etch(address(0x0a01), address(new MockVerify()).code);
        vm.etch(address(0x0a02), address(new MockKeyStatus()).code);
        MockKeyStatus(address(0x0a02)).set(owner, pubkey);
        guard = new QoreConnectGuard(owner, 1 ether);
        vm.deal(address(this), 100 ether);
        (bool ok,) = address(guard).call{value: 10 ether}("");
        assertTrue(ok);
    }

    function test_PrecompileAddresses() public view {
        assertEq(guard.PQC_VERIFY(), address(0x0a01));
        assertEq(guard.PQC_KEY_STATUS(), address(0x0a02));
    }

    function test_Deposit() public {
        guard.deposit{value: 1 ether}();
        assertEq(address(guard).balance, 11 ether);
    }

    function test_SmallWithdrawWithoutRoot() public {
        vm.prank(owner);
        guard.withdraw(to, 1 ether);
        assertEq(to.balance, 1 ether);
    }

    function test_RevertNotOwner() public {
        vm.expectRevert(QoreConnectGuard.NotOwner.selector);
        guard.withdraw(to, 1);
    }

    function test_RevertOverThresholdWithoutRoot() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(QoreConnectGuard.OverThreshold.selector, 2 ether, 1 ether));
        guard.withdraw(to, 2 ether);
    }

    function test_LargeWithdrawWithRootSignature() public {
        bytes memory sig = sign(pubkey, guard.withdrawDigest(to, 5 ether, 0));
        vm.prank(owner);
        guard.withdrawWithRoot(to, 5 ether, sig);
        assertEq(to.balance, 5 ether);
        assertEq(guard.nonce(), 1);
    }

    function test_RevertReplayedRootSignature() public {
        bytes memory sig = sign(pubkey, guard.withdrawDigest(to, 1 ether, 0));
        vm.startPrank(owner);
        guard.withdrawWithRoot(to, 1 ether, sig);
        vm.expectRevert(QoreConnectGuard.BadRootSignature.selector);
        guard.withdrawWithRoot(to, 1 ether, sig);
        vm.stopPrank();
    }

    function test_RevertSignatureForOtherAmountOrRecipient() public {
        bytes memory sig = sign(pubkey, guard.withdrawDigest(to, 1 ether, 0));
        vm.startPrank(owner);
        vm.expectRevert(QoreConnectGuard.BadRootSignature.selector);
        guard.withdrawWithRoot(to, 9 ether, sig);
        vm.expectRevert(QoreConnectGuard.BadRootSignature.selector);
        guard.withdrawWithRoot(payable(makeAddr("attacker")), 1 ether, sig);
        vm.stopPrank();
    }

    function test_RevertWrongKey() public {
        bytes memory sig = sign(hex"deadbeef", guard.withdrawDigest(to, 5 ether, 0));
        vm.prank(owner);
        vm.expectRevert(QoreConnectGuard.BadRootSignature.selector);
        guard.withdrawWithRoot(to, 5 ether, sig);
    }

    function test_RevertRootKeyNotRegistered() public {
        address bare = makeAddr("no-pqc-key");
        QoreConnectGuard g = new QoreConnectGuard(bare, 1 ether);
        assertEq(g.rootPublicKey().length, 0);
        vm.prank(bare);
        vm.expectRevert(QoreConnectGuard.RootKeyNotRegistered.selector);
        g.withdrawWithRoot(to, 1, hex"00");
    }

    function test_RevertInsufficientBalance() public {
        bytes memory sig = sign(pubkey, guard.withdrawDigest(to, 50 ether, 0));
        vm.prank(owner);
        vm.expectRevert(QoreConnectGuard.InsufficientBalance.selector);
        guard.withdrawWithRoot(to, 50 ether, sig);
    }

    function test_SetThresholdNeedsRoot() public {
        vm.startPrank(owner);
        vm.expectRevert(QoreConnectGuard.BadRootSignature.selector);
        guard.setThreshold(100 ether, hex"01");
        guard.setThreshold(3 ether, sign(pubkey, guard.thresholdDigest(3 ether, 0)));
        assertEq(guard.threshold(), 3 ether);
        guard.withdraw(to, 3 ether);
        vm.stopPrank();
        assertEq(to.balance, 3 ether);
    }

    function test_RevertTransferFailed() public {
        vm.prank(owner);
        vm.expectRevert(QoreConnectGuard.TransferFailed.selector);
        guard.withdraw(payable(address(this)), 1); // this test contract has no receive()
    }

    function testFuzz_ClassicalKeyCappedAtThreshold(uint256 amount) public {
        amount = bound(amount, 0, 10 ether);
        vm.prank(owner);
        if (amount > 1 ether) {
            vm.expectRevert(abi.encodeWithSelector(QoreConnectGuard.OverThreshold.selector, amount, 1 ether));
            guard.withdraw(to, amount);
        } else {
            guard.withdraw(to, amount);
            assertEq(to.balance, amount);
        }
    }

    function testFuzz_ForgedSignatureRejected(bytes calldata forged) public {
        vm.assume(keccak256(forged) != keccak256(sign(pubkey, guard.withdrawDigest(to, 5 ether, 0))));
        vm.prank(owner);
        vm.expectRevert(QoreConnectGuard.BadRootSignature.selector);
        guard.withdrawWithRoot(to, 5 ether, forged);
    }
}
