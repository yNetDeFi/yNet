// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "./libs/BEP20.sol";

contract YnetToken is BEP20 {

    // Burn address
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    // Transfer tax rate in basis points. (default 7.5%)
    uint16 public transferTaxRate = 750;

    // Max transfer tax rate: 10%.
    uint16 public constant MAXIMUM_TRANSFER_TAX_RATE = 1000;

    // The operator can only update the transfer tax rate
    address private _operator;

    // Events
    event OperatorTransferred(address indexed previousOperator, address indexed newOperator);
    event TransferTaxRateUpdated(address indexed operator, uint256 previousRate, uint256 newRate);

    /**
     * @notice Checks if the function is called by operator.
     */
    modifier onlyOperator() {
        require(_operator == _msgSender(), "operator: caller is not the operator");
        _;
    }

    /**
     * @notice Constructs the YnetToken contract.
     */
    constructor() public BEP20("yNet", "yNet") {
        _operator = _msgSender();
        emit OperatorTransferred(address(0), _operator);
    }

    /// @notice Creates `_amount` token to `_to`. Must only be called by the owner (MasterChef)
    function mint(address _to, uint256 _amount) public onlyOwner {
        _mint(_to, _amount);
    }

    /// @dev overrides transfer function to meet tokenomics of YNET
     function _transfer(address sender, address recipient, uint256 amount) internal virtual override {
        if (recipient == BURN_ADDRESS) {
            super._transfer(sender, recipient, amount);
        } else {
            // default tax is 7.5% of every transfer
            uint256 burnAmount = amount.mul(transferTaxRate).div(10000);
            // default 92.5% of transfer sent to recipient
            uint256 sendAmount = amount.sub(burnAmount);
            require(amount == sendAmount + burnAmount, "YNET::transfer: Burn value invalid");

            super._transfer(sender, BURN_ADDRESS, burnAmount);
            super._transfer(sender, recipient, sendAmount);
        }
    }  

    /**
     * @dev Update the transfer tax rate.
     * Can only be called by the current operator.
     */
    function updateTransferTaxRate(uint16 _transferTaxRate) external onlyOperator {
        require(_transferTaxRate <= MAXIMUM_TRANSFER_TAX_RATE, "YNET::updateTransferTaxRate: Transfer tax rate must not exceed the maximum rate.");
        emit TransferTaxRateUpdated(_msgSender(), transferTaxRate, _transferTaxRate);
        transferTaxRate = _transferTaxRate;
    }

    /**
     * @dev Returns the address of the current operator.
     */
    function operator() public view returns (address) {
        return _operator;
    }

    /**
     * @dev Transfers operator of the contract to a new account (`newOperator`).
     * Can only be called by the current operator.
     */
    function transferOperator(address newOperator) external onlyOperator {
        require(newOperator != address(0), "YNET::transferOperator: new operator is the zero address");
        emit OperatorTransferred(_operator, newOperator);
        _operator = newOperator;
    }
}