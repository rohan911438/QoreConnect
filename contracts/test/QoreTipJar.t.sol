// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {QoreTipJar} from "../src/QoreTipJar.sol";

contract RejectEther {
    receive() external payable {
        revert("no");
    }
}

/// Re-enters withdraw() from its receive hook.
contract ReentrantCreator {
    QoreTipJar public jar;
    bool public reentered;

    constructor(QoreTipJar jar_) {
        jar = jar_;
    }

    function pull() external {
        jar.withdraw();
    }

    receive() external payable {
        if (!reentered) {
            reentered = true;
            jar.withdraw();
        }
    }
}

contract QoreTipJarTest is Test {
    QoreTipJar jar;
    address alice = makeAddr("alice");
    address creator = makeAddr("creator");

    event Tipped(address indexed from, address indexed creator, uint256 amount, string note);
    event Withdrawn(address indexed creator, address indexed to, uint256 amount);

    function setUp() public {
        jar = new QoreTipJar();
        vm.deal(alice, 100 ether);
    }

    function test_TipCreditsCreator() public {
        vm.expectEmit(true, true, false, true);
        emit Tipped(alice, creator, 1 ether, "thanks");
        vm.prank(alice);
        jar.tip{value: 1 ether}(creator, "thanks");
        assertEq(jar.balanceOf(creator), 1 ether);
        assertEq(jar.totalReceived(creator), 1 ether);
        assertEq(jar.tipCount(creator), 1);
        assertEq(jar.totalTipped(), 1 ether);
        assertEq(address(jar).balance, 1 ether);
    }

    function test_RevertZeroTip() public {
        vm.expectRevert(QoreTipJar.ZeroTip.selector);
        jar.tip(creator, "");
    }

    function test_RevertZeroCreator() public {
        vm.prank(alice);
        vm.expectRevert(QoreTipJar.ZeroCreator.selector);
        jar.tip{value: 1}(address(0), "");
    }

    function test_RevertNoteTooLong() public {
        bytes memory long = new bytes(141);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(QoreTipJar.NoteTooLong.selector, 141));
        jar.tip{value: 1}(creator, string(long));
    }

    function test_NoteAtLimitAccepted() public {
        bytes memory note = new bytes(140);
        vm.prank(alice);
        jar.tip{value: 1}(creator, string(note));
        assertEq(jar.tipCount(creator), 1);
    }

    function test_Withdraw() public {
        vm.prank(alice);
        jar.tip{value: 2 ether}(creator, "a");
        vm.expectEmit(true, true, false, true);
        emit Withdrawn(creator, creator, 2 ether);
        vm.prank(creator);
        jar.withdraw();
        assertEq(creator.balance, 2 ether);
        assertEq(jar.balanceOf(creator), 0);
        assertEq(jar.totalReceived(creator), 2 ether);
    }

    function test_WithdrawTo() public {
        address to = makeAddr("to");
        vm.prank(alice);
        jar.tip{value: 1 ether}(creator, "a");
        vm.prank(creator);
        jar.withdrawTo(payable(to));
        assertEq(to.balance, 1 ether);
    }

    function test_RevertWithdrawToZero() public {
        vm.prank(creator);
        vm.expectRevert(QoreTipJar.ZeroCreator.selector);
        jar.withdrawTo(payable(address(0)));
    }

    function test_RevertNothingToWithdraw() public {
        vm.prank(creator);
        vm.expectRevert(QoreTipJar.NothingToWithdraw.selector);
        jar.withdraw();
    }

    function test_RevertTransferFailedKeepsBalance() public {
        RejectEther r = new RejectEther();
        vm.prank(alice);
        jar.tip{value: 1 ether}(address(r), "a");
        vm.prank(address(r));
        vm.expectRevert(QoreTipJar.TransferFailed.selector);
        jar.withdraw();
        assertEq(jar.balanceOf(address(r)), 1 ether);
    }

    function test_ReentrancyBlocked() public {
        ReentrantCreator rc = new ReentrantCreator(jar);
        vm.prank(alice);
        jar.tip{value: 1 ether}(address(rc), "a");
        // The nested withdraw reverts, so the outer transfer fails and nothing moves.
        vm.expectRevert(QoreTipJar.TransferFailed.selector);
        rc.pull();
        assertEq(jar.balanceOf(address(rc)), 1 ether);
    }

    function test_OtherCreatorsUntouched() public {
        address other = makeAddr("other");
        vm.startPrank(alice);
        jar.tip{value: 1 ether}(creator, "a");
        jar.tip{value: 3 ether}(other, "b");
        vm.stopPrank();
        vm.prank(creator);
        jar.withdraw();
        assertEq(jar.balanceOf(other), 3 ether);
        assertEq(address(jar).balance, 3 ether);
    }

    function testFuzz_TipsSumAndWithdraw(uint96 a, uint96 b, uint8 noteLen) public {
        vm.assume(a > 0 && b > 0);
        noteLen = uint8(bound(noteLen, 0, 140));
        string memory note = string(new bytes(noteLen));
        vm.deal(alice, uint256(a) + uint256(b));
        vm.startPrank(alice);
        jar.tip{value: a}(creator, note);
        jar.tip{value: b}(creator, note);
        vm.stopPrank();
        uint256 sum = uint256(a) + uint256(b);
        assertEq(jar.balanceOf(creator), sum);
        assertEq(jar.tipCount(creator), 2);
        vm.prank(creator);
        jar.withdraw();
        assertEq(creator.balance, sum);
        assertEq(address(jar).balance, 0);
    }

    function testFuzz_JarBalanceEqualsSumOfBalances(address c1, address c2, uint64 v1, uint64 v2) public {
        vm.assume(c1 != address(0) && c2 != address(0) && v1 > 0 && v2 > 0);
        vm.deal(alice, uint256(v1) + v2);
        vm.startPrank(alice);
        jar.tip{value: v1}(c1, "");
        jar.tip{value: v2}(c2, "");
        vm.stopPrank();
        uint256 owed = c1 == c2 ? jar.balanceOf(c1) : jar.balanceOf(c1) + jar.balanceOf(c2);
        assertEq(address(jar).balance, owed);
        assertEq(jar.totalTipped(), uint256(v1) + v2);
    }
}
