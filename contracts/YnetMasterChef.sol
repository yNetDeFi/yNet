// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "./libs/SafeMath.sol";
import "./libs/IBEP20.sol";
import "./libs/SafeBEP20.sol";
import "./libs/Ownable.sol";
import "./libs/ReentrancyGuard.sol";
import "./libs/IYnetReferral.sol";

import "./YnetToken.sol";

// YnetMasterChef is the master of Ynet. He can make Ynet and he is a fair guy.
//
// Note that it's ownable and the owner wields tremendous power. The ownership
// will be transferred to a governance smart contract once Ynet is sufficiently
// distributed and the community can show to govern itself.
//
// Have fun reading it. Hopefully it's bug-free. God bless.
contract YnetMasterChef is Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeBEP20 for IBEP20;

    // Info of each user.
    struct UserInfo {
        uint256 amount;         // How many LP tokens the user has provided.
        uint256 rewardDebt;     // Reward debt. See explanation below.
        //
        // At any point in time, the pending amount of Ynets
        // to be distributed to a user is calculated as :
        //
        //   pending reward = (user.amount * pool.accYnetPerShare) - user.rewardDebt
        //
        // Whenever a user deposits or withdraws LP tokens to a pool :
        //   1. The pool's `accYnetPerShare` (and `lastRewardBlock`) gets updated.
        //   2. User receives the pending reward sent to his/her address.
        //   3. User's `amount` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }

    // Info of each pool.
    struct PoolInfo {
        IBEP20 lpToken;           // Address of LP token contract.
        uint256 allocPoint;       // How many allocation points assigned to this pool. Ynets to distribute per block.
        uint256 lastRewardBlock;  // Last block number that Ynets distribution occurs.
        uint256 accYnetPerShare;   // Accumulated Ynets per share, times 1e12. See below.
        uint16 depositFeeBP;      // Deposit fee in basis points
    }

    // The Ynet TOKEN!
    YnetToken public ynet;
    // Dev address.
    address public devAddress;
    // Deposit Fee address
    address public feeAddress;
    // Ynet tokens created per block.
    uint256 public ynetPerBlock;

    // Initial emission rate: 1 Ynet per block.
    uint256 public constant INITIAL_EMISSION_RATE = 10;
    // Minimum emission rate: 0.1 Ynet per block.
    uint256 public constant MINIMUM_EMISSION_RATE = 1;
    // Reduce emission every 9,600 blocks ~ 8 hours.
    uint256 public constant EMISSION_REDUCTION_PERIOD_BLOCKS = 100;
    // Emission reduction rate per period in basis points: 3%.
    uint256 public constant EMISSION_REDUCTION_RATE_PER_PERIOD = 5000;
    // Last reduction period index
    uint256 public lastReductionPeriodIndex = 0;

    // Info of each pool.
    PoolInfo[] public poolInfo;
    // Info of each user that stakes LP tokens.
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;
    // Total allocation points. Must be the sum of all allocation points in all pools.
    uint256 public totalAllocPoint = 0;
    // The block number when Ynet mining starts.
    uint256 public startBlock;

    // Ynet referral contract address.
    IYnetReferral public ynetReferral;
    // Referral commission rate in basis points.
    uint16 public referralCommissionRate = 200;
    // Max referral commission rate: 20%.
    uint16 public constant MAXIMUM_REFERRAL_COMMISSION_RATE = 2000;

    //check pool existence
    mapping(IBEP20 => bool) public poolExistence;

    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event EmissionRateUpdated(address indexed caller, uint256 previousAmount, uint256 newAmount);
    event ReferralCommissionPaid(address indexed user, address indexed referrer, uint256 commissionAmount);

    modifier nonDuplicated(IBEP20 _lpToken) {
        require(poolExistence[_lpToken] == false,
        "nonDuplicated: duplicate pool");
        _;
    }

    /**
     * @notice Constructs the yNetMasterChef contract.
     */
    constructor(
        YnetToken _ynet,
        uint256 _startBlock
    ) public {
        ynet = _ynet;
        startBlock = _startBlock;

        devAddress = msg.sender;
        feeAddress = msg.sender;
        ynetPerBlock = INITIAL_EMISSION_RATE;
    }

    /** 
    *@notice Returns the number of pools.
    */
    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

     /**
     *@dev Adds new pool to poolInfo, must be called by owner.
     *@param _allocPoint Allocation points for pool to be added
     *@param _lpToken Contract address of pool
     *@param _depositFeeBP Represents deposit fee for pool in basis points
     *@param _withUpdate If true, runs massUpdatePool()
     */
    // XXX DO NOT add the same LP token more than once. Rewards will be messed up if you do.
    function add(uint256 _allocPoint, IBEP20 _lpToken, uint16 _depositFeeBP, bool _withUpdate) public onlyOwner nonDuplicated(_lpToken){
        // sanity check
        _lpToken.balanceOf(address(this)); 
        require(_depositFeeBP <= 400, "add: invalid deposit fee basis points");
        if (_withUpdate) {
            massUpdatePools();
        }
        uint256 lastRewardBlock = block.number > startBlock ? block.number : startBlock;
        totalAllocPoint = totalAllocPoint.add(_allocPoint);
        poolInfo.push(PoolInfo({
            lpToken: _lpToken,
            allocPoint: _allocPoint,
            lastRewardBlock: lastRewardBlock,
            accYnetPerShare: 0,
            depositFeeBP: _depositFeeBP
        }));

        poolExistence[_lpToken] = true;
    }

    /**
     *@dev Modifies an added pool, can be called by owner only.
     *@param _pid Pool ID of pool to be updated
     *@param _allocPoint Allocation points for pool to be updated
     *@param _depositFeeBP Deposit fee for updated pool in basis points
     *@param _withUpdate If true, runs massUpdatePool()
     */
    function set(uint256 _pid, uint256 _allocPoint, uint16 _depositFeeBP, bool _withUpdate) public onlyOwner {
        require(_depositFeeBP <= 400, "set: invalid deposit fee basis points");
        if (_withUpdate) {
            massUpdatePools();
        }
        totalAllocPoint = totalAllocPoint.sub(poolInfo[_pid].allocPoint).add(_allocPoint);
        poolInfo[_pid].allocPoint = _allocPoint;
        poolInfo[_pid].depositFeeBP = _depositFeeBP;
    }

    /** 
    *@notice Return reward multiplier over the given _from to _to block.
    *@param _from first block number.
    *@param _to second block number.
    */
    function getMultiplier(uint256 _from, uint256 _to) public pure returns (uint256) {
        return _to.sub(_from);
    }

    /** 
    *@dev Returns pending yNets of a user on frontend.
    *@param _pid Pool ID of the pool.
    *@param _user Address of the user.
    */
    function pendingYnet(uint256 _pid, address _user) external view returns (uint256) {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];
        uint256 accYnetPerShare = pool.accYnetPerShare;
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (block.number > pool.lastRewardBlock && lpSupply != 0) {
            uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
            uint256 ynetReward = multiplier.mul(ynetPerBlock).mul(pool.allocPoint).div(totalAllocPoint);
            accYnetPerShare = accYnetPerShare.add(ynetReward.mul(1e12).div(lpSupply));
        }
        return user.amount.mul(accYnetPerShare).div(1e12).sub(user.rewardDebt);
    }

    /** 
    *@dev Update reward variables for all pools.
    */
    function massUpdatePools() public {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            updatePool(pid);
        }
    }

    /** 
    *@dev Update reward variables of the given pool to be up-to-date.
    *@param _pid Pool ID of the pool.
    */
    function updatePool(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        if (block.number <= pool.lastRewardBlock) {
            return;
        }
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (lpSupply == 0 || pool.allocPoint == 0) {
            pool.lastRewardBlock = block.number;
            return;
        }
        uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
        uint256 ynetReward = multiplier.mul(ynetPerBlock).mul(pool.allocPoint).div(totalAllocPoint);
        ynet.mint(devAddress, ynetReward.div(10));
        ynet.mint(address(this), ynetReward);
        pool.accYnetPerShare = pool.accYnetPerShare.add(ynetReward.mul(1e12).div(lpSupply));
        pool.lastRewardBlock = block.number;
    }

    /**
     *@notice Deposits _amount from user's balance to pool _pid
     *@param _pid Pool ID of pool in which amount will be deposited
     *@param _amount Number of tokens to be deposited
     *@param _referrer Address of the referrer, if any
     */
    function deposit(uint256 _pid, uint256 _amount, address _referrer) external nonReentrant {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        updatePool(_pid);
        if (_amount > 0 && address(ynetReferral) != address(0) && _referrer != address(0) && _referrer != msg.sender) {
            ynetReferral.recordReferral(msg.sender, _referrer);
        }
        if (user.amount > 0) {
            uint256 pending = user.amount.mul(pool.accYnetPerShare).div(1e12).sub(user.rewardDebt);
            if (pending > 0) {
                safeYnetTransfer(msg.sender, pending);
                payReferralCommission(msg.sender, pending);
            }
        }        
        if (_amount > 0) {
            uint256 balanceBefore = pool.lpToken.balanceOf(address(this));
            pool.lpToken.safeTransferFrom(msg.sender, address(this), _amount);
            _amount = pool.lpToken.balanceOf(address(this)).sub(balanceBefore);
            if (pool.depositFeeBP > 0) {
                uint256 depositFee = _amount.mul(pool.depositFeeBP).div(10000);
                pool.lpToken.safeTransfer(feeAddress, depositFee);
                user.amount = user.amount.add(_amount).sub(depositFee);
            } else {
                user.amount = user.amount.add(_amount);
            }
        }
        user.rewardDebt = user.amount.mul(pool.accYnetPerShare).div(1e12);
        emit Deposit(msg.sender, _pid, _amount);
    }

    /**
     *@notice Withdraws _amount from given pool to user's address.
     *@param _pid Pool ID of pool from where amount will be withdrawn.
     *@param _amount Number of tokens to be withdrawn.
     */
    function withdraw(uint256 _pid, uint256 _amount) external nonReentrant {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        require(user.amount >= _amount, "withdraw: not good");
        updatePool(_pid);
        uint256 pending = user.amount.mul(pool.accYnetPerShare).div(1e12).sub(user.rewardDebt);
        if (pending > 0) {
            safeYnetTransfer(msg.sender, pending);
            payReferralCommission(msg.sender, pending);
        }
        if (_amount > 0) {
            user.amount = user.amount.sub(_amount);
            pool.lpToken.safeTransfer(address(msg.sender), _amount);
        }
        user.rewardDebt = user.amount.mul(pool.accYnetPerShare).div(1e12);
        emit Withdraw(msg.sender, _pid, _amount);
    }

    /** 
    *@notice Withdraw without caring about rewards. EMERGENCY ONLY.
    *@param _pid Pool ID of the pool.
    */
    function emergencyWithdraw(uint256 _pid) external nonReentrant {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        uint256 amount = user.amount;
        user.amount = 0;
        user.rewardDebt = 0;
        pool.lpToken.safeTransfer(address(msg.sender), amount);
        emit EmergencyWithdraw(msg.sender, _pid, amount);
    }

    /** 
    *@dev yNet transfer function
    *@param _to Address of the receiver.
    *@param _amount Amount to be transferred.
    */
    function safeYnetTransfer(address _to, uint256 _amount) internal {
        uint256 ynetBal = ynet.balanceOf(address(this));
        bool transferSuccess = false;
        if (_amount > ynetBal) {
            transferSuccess = ynet.transfer(_to, ynetBal);
        } else {
            transferSuccess = ynet.transfer(_to, _amount);
        }
        require(transferSuccess, "safeYnetTransfer: Transfer failed");
    }

    /** 
    *@dev Updates dev address, can be called by the previous dev only.
    *@param _devAddress Address of the new dev.
    */
    function setDevAddress(address _devAddress) external {
        require(msg.sender == devAddress, "setDevAddress: FORBIDDEN");
        require(_devAddress != address(0), "setDevAddress: cannot set dev adddres to zero address");
        devAddress = _devAddress;
    }

    /** 
    *@dev Updates fee address, can be called by the previous fee address only.
    *@param _feeAddress Address of the new fee address.
    */
    function setFeeAddress(address _feeAddress) external {
        require(msg.sender == feeAddress, "setFeeAddress: FORBIDDEN");
        require(_feeAddress != address(0), "setFeeAddress: cannot set fee adddres to zero address");
        feeAddress = _feeAddress;
    }

    /** 
    *@dev Reduces emission rate of yNet.
    */
    function updateEmissionRate() public {
        require(block.number > startBlock, "updateEmissionRate: Can only be called after mining starts");
        require(ynetPerBlock > MINIMUM_EMISSION_RATE, "updateEmissionRate: Emission rate has reached the minimum threshold");

        uint256 currentIndex = block.number.sub(startBlock).div(EMISSION_REDUCTION_PERIOD_BLOCKS);
        if (currentIndex <= lastReductionPeriodIndex) {
            return;
        }

        uint256 newEmissionRate = ynetPerBlock;
        for (uint256 index = lastReductionPeriodIndex; index < currentIndex; ++index) {
            newEmissionRate = newEmissionRate.mul(1e4 - EMISSION_REDUCTION_RATE_PER_PERIOD).div(1e4);
        }

        newEmissionRate = newEmissionRate < MINIMUM_EMISSION_RATE ? MINIMUM_EMISSION_RATE : newEmissionRate;
        if (newEmissionRate >= ynetPerBlock) {
            return;
        }

        massUpdatePools();
        lastReductionPeriodIndex = currentIndex;
        uint256 previousEmissionRate = ynetPerBlock;
        ynetPerBlock = newEmissionRate;
        emit EmissionRateUpdated(msg.sender, previousEmissionRate, newEmissionRate);
    }

    /** 
    *@dev Updates the ynet referral contract address, can be called by owner only.
    *@param _ynetReferral Referral contract address.
    */
    function setYnetReferral(IYnetReferral _ynetReferral) public onlyOwner {
        // sanity check
        _ynetReferral.getReferrer(address(this));
        require(address(ynetReferral) == address(0), "setYnetReferral: yNet referral already set");
        ynetReferral = _ynetReferral;
    }

    /** 
    *@dev Updates referral commission rate for the masterChef contract, can be called by owner only.
    *@param _referralCommissionRate New referral commission rate.
    */
    function setReferralCommissionRate(uint16 _referralCommissionRate) external onlyOwner {
        require(_referralCommissionRate <= MAXIMUM_REFERRAL_COMMISSION_RATE, "setReferralCommissionRate: invalid referral commission rate basis points");
        referralCommissionRate = _referralCommissionRate;
    }

    /** 
    *@dev Function to pay referral commission to the referrer.
    *@param _user Address of the referrer.
    *@param _pending Amount to be paid to referrer.
    */
    function payReferralCommission(address _user, uint256 _pending) internal {
        if (address(ynetReferral) != address(0) && referralCommissionRate > 0) {
            address referrer = ynetReferral.getReferrer(_user);
            uint256 commissionAmount = _pending.mul(referralCommissionRate).div(10000);

            if (referrer != address(0) && commissionAmount > 0) {
                ynet.mint(referrer, commissionAmount);
                emit ReferralCommissionPaid(_user, referrer, commissionAmount);
            }
        }
    }

    /**
    *@dev Updates the start block of contract, can be called by owner only.
    *@param _startBlock new start block.
    *@notice block numbers for binance in a day are 28800, total blocks in 30 days are 864000.
    *@notice block numbers for polygon in a day are 39200, total blocks in 30 days are 1176000.
    */
    function updateStartBlock(uint256 _startBlock) external onlyOwner {
        require(block.number < startBlock, "Start block can not be changed once the sale has started.");
        require(_startBlock <= block.number + 28800*30 , "Start block should not be more than 30 days ahead of current block");
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            PoolInfo storage pool = poolInfo[pid];
            pool.lastRewardBlock = _startBlock;
        }
        
        startBlock = _startBlock;
    }
}