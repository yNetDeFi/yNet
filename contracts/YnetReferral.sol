// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "./libs/IBEP20.sol";
import "./libs/SafeBEP20.sol";
import "./libs/IYnetReferral.sol";
import "./libs/Ownable.sol";

contract YNetReferral is IYnetReferral, Ownable {
    using SafeBEP20 for IBEP20;

    mapping(address => bool) public operators;
    mapping(address => address) public referrers; 
    mapping(address => uint256) public referralsCount; 

    event ReferralRecorded(address indexed user, address indexed referrer);
    event OperatorUpdated(address indexed operator, bool indexed status);

    /**
     * @notice Checks if the function is called by operator.
     */
    modifier onlyOperator {
        require(operators[msg.sender], "Operator: caller is not the operator");
        _;
    }

    /**
     * @dev records a referrer address against a user, can only be called by operator
     * @param _user address of the user.
     * @param _user address of the referrer.
     */
    function recordReferral(address _user, address _referrer) public override onlyOperator {
        if (_user != address(0)
            && _referrer != address(0)
            && _user != _referrer
            && referrers[_user] == address(0)
        ) {
            referrers[_user] = _referrer;
            referralsCount[_referrer] += 1;
            emit ReferralRecorded(_user, _referrer);
        }
    }

    /**
     * @dev Returns the referrer address that referred the user
     * @param _user address of the user.
     */
    function getReferrer(address _user) public override view returns (address) {
        return referrers[_user];
    }

    /**
     * @dev Updates the status of the operator, can only be called by owner
     * @param _operator address of the operator.
     * @param _status status of the operator.
     */
    function updateOperator(address _operator, bool _status) external onlyOwner {
        operators[_operator] = _status;
        emit OperatorUpdated(_operator, _status);
    }

    /**
     * @dev Drain tokens that are sent here by mistake, can only be called by owner
     * @param _token address of the token.
     * @param _amount amount to be drained.
     * @param _to address of the receiver.
     */
    function drainBEP20Token(IBEP20 _token, uint256 _amount, address _to) external onlyOwner {
        _token.safeTransfer(_to, _amount);
    }
}