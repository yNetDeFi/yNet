// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "./libs/BEP20.sol";

// YnetToken with Governance.
contract YnetToken is BEP20("Ynet", "Ynet") {
    // Burn address
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    /// @notice Creates `_amount` token to `_to`. Must only be called by the owner (MasterChef).
    function mint(address _to, uint256 _amount) public onlyOwner {
        _mint(_to, _amount);
    }

    /// @dev overrides transfer function to meet tokenomics of Ynet
      function _transfer(address sender, address recipient, uint256 amount) internal virtual override {
        if (recipient == BURN_ADDRESS) {
            super._transfer(sender, recipient, amount);
        } else {
            // 2% of every transfer burnt
            uint256 burnAmount = amount.mul(2).div(100);
            // 98% of transfer sent to recipient
            uint256 sendAmount = amount.sub(burnAmount);
            require(amount == sendAmount + burnAmount, "Ynet::transfer: Burn value invalid");

            super._transfer(sender, BURN_ADDRESS, burnAmount);
            super._transfer(sender, recipient, sendAmount);
            amount = sendAmount;
        }
    }  
}