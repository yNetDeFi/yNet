const { expectRevert, time, constants, BN } = require('@openzeppelin/test-helpers')
const YnetToken = artifacts.require('YnetToken')
const YnetMasterChef = artifacts.require('YnetMasterChef')
const MockBEP20 = artifacts.require('MockBEP20')

contract('YnetMasterChef', ([alice, bob, carol, dev, eliah, minter, feeAddress, devAddress]) => {
    beforeEach(async () => {
        this.YnetToken = await YnetToken.new({ from: alice })
    })

    it('should set correct state variables', async () => {
        this.master = await YnetMasterChef.new(this.YnetToken.address, 100, { from: alice })
        await this.YnetToken.transferOwnership(this.master.address, { from: alice })

        assert.equal(await this.master.ynet().valueOf(), this.YnetToken.address)
        assert.equal((await this.master.startBlock()).valueOf(), 100)
        assert.equal((await this.master.feeAddress()).valueOf(), alice)
    })

    it('should allow only master farmer can mint', async () => {
        this.master = await YnetMasterChef.new(this.YnetToken.address, 100, { from: alice })
        await this.YnetToken.transferOwnership(minter, { from: alice })
        assert.equal((await this.YnetToken.owner()).valueOf(), minter)
        await expectRevert(
            this.YnetToken.mint(alice, '10000000000', { from: alice }),
            "Ownable: caller is not the owner")

        await this.YnetToken.mint(alice, '10000000000', { from: minter })
        assert.equal((await this.YnetToken.balanceOf(alice)).valueOf(), "10000000000")
    })

    it('should update dev address by pervious dev only ', async () => {
        this.master = await YnetMasterChef.new(this.YnetToken.address, 100, { from: alice })
        await this.YnetToken.transferOwnership(this.master.address, { from: alice })

        await expectRevert(
            this.master.setDevAddress(devAddress, { from: bob }),
            'setDevAddress: FORBIDDEN')

        await this.master.setDevAddress(devAddress, { from: alice })
        assert.equal((await this.master.devAddress.call()).valueOf(), devAddress)
    })

    it('should update fee address by pervious feeAddress only ', async () => {
        this.master = await YnetMasterChef.new(this.YnetToken.address, 100, { from: alice })
        await this.YnetToken.transferOwnership(this.master.address, { from: alice })

        await expectRevert(
            this.master.setFeeAddress(feeAddress, { from: bob }),
            'setFeeAddress: FORBIDDEN')

        await this.master.setFeeAddress(feeAddress, { from: alice })
        assert.equal((await this.master.feeAddress.call()).valueOf(), feeAddress)
    })

    // Reduce from 1 Ynet/block to 0.97 Ynet/block after 9600 blocks ie 8 hours.
    /**
    it('should reduce the EMISSION RATE by 3% after 9600 blocks  ', async () => {
        this.master = await YnetMasterChef.new(this.YnetToken.address, 100, { from: alice })
        await this.YnetToken.transferOwnership(this.master.address, { from: alice })
     
        await time.advanceBlockTo(99);
        await time.advanceBlockTo(130);
        await this.master.updateEmissionRate({from : bob})
        console.log("Current Block Height : ",await  time.latestBlock()) 
        assert.equal((await this.master.ynetPerBlock.call()).toString() , '1000000000000000000') 
        assert.equal((await this.master.INITIAL_EMISSION_RATE.call()).toString() ,'1000000000000000000') 
        assert.equal((await this.master.EMISSION_REDUCTION_PERIOD_BLOCKS.call()).toString() , '9600') 
        assert.equal((await this.master.EMISSION_REDUCTION_RATE_PER_PERIOD.call()).toString() , '300') 
        await time.advanceBlockTo(9701); 
        console.log("Current Block Height : ",await  time.latestBlock()) 
        await this.master.updateEmissionRate({from : bob})
        assert.equal((await this.master.ynetPerBlock.call()).toString() , '970000000000000000') 
        assert.equal((await this.master.EMISSION_REDUCTION_PERIOD_BLOCKS.call()).toString() , '9600') 
        assert.equal((await this.master.EMISSION_REDUCTION_RATE_PER_PERIOD.call()).toString() , '300')  
        console.log("Current Block Height : ",await  time.latestBlock()) 
        await time.advanceBlockTo(19302); 
        await this.master.updateEmissionRate({from : bob})
        assert.equal((await this.master.ynetPerBlock.call()).toString() ,'940900000000000000') 
    }) */

    it('should allow multiple deposit & partial withdraw properly', async () => {
        this.lp1 = await MockBEP20.new('Token1', 'TK1', '10000000000', { from: minter })
        await this.lp1.transfer(alice, '2000', { from: minter })
        await this.lp1.transfer(bob, '2000', { from: minter })

        this.master = await YnetMasterChef.new(this.YnetToken.address, 100, { from: alice })
        await this.master.add(100, this.lp1.address, 500, true, { from: alice })

        await this.lp1.approve(this.master.address, 1000, { from: alice })
        await this.lp1.approve(this.master.address, 1000, { from: bob })

        assert.equal((await this.lp1.allowance(alice, this.master.address)).valueOf(), '1000')
        assert.equal((await this.lp1.balanceOf(this.master.address)).valueOf(), '0')

        await this.master.setFeeAddress(feeAddress, { from: alice })
        await this.master.setDevAddress(devAddress, { from: alice })
        await this.YnetToken.transferOwnership(this.master.address, { from: alice })

        await time.advanceBlockTo(99);

        await this.master.deposit(0, '100', constants.ZERO_ADDRESS, { from: alice })
        assert.equal((await this.lp1.balanceOf(this.master.address)).toString(), '95') // 100 - 5% of 100
        assert.equal((await this.lp1.balanceOf(await this.master.feeAddress.call())).valueOf(), '5') // 5% of 100 

        await this.master.deposit(0, '200', constants.ZERO_ADDRESS, { from: alice })
        assert.equal((await this.lp1.balanceOf(this.master.address)).toString(), '285') // 200 - 5% of 200 + previous : 95
        assert.equal((await this.lp1.balanceOf(await this.master.feeAddress.call())).valueOf(), '15') // 5% of 200 + previous : 5 

        await this.master.withdraw(0, '150', { from: alice })

        await this.master.deposit(0, '300', constants.ZERO_ADDRESS, { from: alice })
        assert.equal((await this.lp1.balanceOf(this.master.address)).toString(), '420') // 285 + 285 -150
        assert.equal((await this.lp1.balanceOf(await this.master.feeAddress.call())).valueOf(), '30') // 5% of 300 + 15

        await this.master.withdraw(0, '250', { from: alice })

        await this.master.deposit(0, '400', constants.ZERO_ADDRESS, { from: alice })
        assert.equal((await this.lp1.balanceOf(this.master.address)).toString(), '550') // 380 + 420 -250
        assert.equal((await this.lp1.balanceOf(await this.master.feeAddress.call())).valueOf(), '50') // 20 + 30 
        assert.equal((await this.master.userInfo(0, alice)).amount.valueOf(), '550') // total available in contract == user.amount

        await expectRevert(
            this.master.deposit(0, '1', constants.ZERO_ADDRESS, { from: alice }),
            'BEP20: transfer amount exceeds allowance')

        assert.equal((await this.lp1.balanceOf(bob)).toString(), '2000') // 2000(total) - 1000(Remaining)

        await this.master.withdraw(0, '250', { from: alice }) // total withdrawn : 950 only as 5% ie 50 deposit fee.

        assert.notEqual((await this.YnetToken.balanceOf(alice)).valueOf(), '0')
        assert.notEqual((await this.YnetToken.balanceOf(this.master.address)).valueOf(), '300')

    })

    context('With LP token added to the field', () => {
        beforeEach(async () => {
            this.lp1 = await MockBEP20.new('Token1', 'TK1', '10000000000', { from: minter })
            await this.lp1.transfer(alice, '1000', { from: minter })
            await this.lp1.transfer(bob, '1000', { from: minter })
            await this.lp1.transfer(carol, '1000', { from: minter })
            await this.lp1.transfer(dev, '1000', { from: minter })
            await this.lp1.transfer(eliah, '1000', { from: minter })
            this.lp2 = await MockBEP20.new('Token2', 'TK2', '10000000000', { from: minter })
            await this.lp2.transfer(alice, '1000', { from: minter })
            await this.lp2.transfer(bob, '1000', { from: minter })
            await this.lp2.transfer(carol, '1000', { from: minter })
            await this.lp2.transfer(dev, '1000', { from: minter })
            await this.lp2.transfer(eliah, '1000', { from: minter })
        })

        it('should correct add new pool and set pool', async () => {
            let currBlockCount = (await time.latestBlock()).toNumber();
            this.master = await YnetMasterChef.new(this.YnetToken.address, currBlockCount + 100, { from: alice })
            await this.YnetToken.transferOwnership(this.master.address, { from: alice })

            await this.master.add('100', this.lp1.address, 1000, true, { from: alice })
            assert.equal((await this.master.poolInfo(0)).lpToken.valueOf(), this.lp1.address)
            assert.equal((await this.master.poolInfo(0)).allocPoint.valueOf(), '100')
            assert.equal((await this.master.poolInfo(0)).lastRewardBlock.valueOf(), currBlockCount + 100)
            assert.equal((await this.master.poolInfo(0)).accYnetPerShare.valueOf(), '0')
            assert.equal((await this.master.poolInfo(0)).depositFeeBP.valueOf(), '1000')

            await expectRevert(
                this.master.add('100', this.lp2.address, 500, true, { from: bob }),
                "Ownable: caller is not the owner"
            )

            await this.master.add('300', this.lp2.address, 700, true, { from: alice })
            assert.equal((await this.master.poolInfo(1)).lpToken.valueOf(), this.lp2.address)
            assert.equal((await this.master.poolInfo(1)).allocPoint.valueOf(), '300')
            assert.equal((await this.master.poolInfo(1)).lastRewardBlock.valueOf(), currBlockCount + 100)
            assert.equal((await this.master.poolInfo(1)).accYnetPerShare.valueOf(), '0')
            assert.equal((await this.master.poolInfo(1)).depositFeeBP.valueOf(), '700')
            // assert.equal((await this.master.poolId1(this.lp2.address)).valueOf(), '2')

            assert.equal((await this.master.totalAllocPoint()).valueOf(), '400')

            await this.master.set(1, 400, 500, true, { from: alice })
            assert.equal((await this.master.poolInfo(1)).allocPoint.valueOf(), '400')
            assert.equal((await this.master.poolInfo(1)).depositFeeBP.valueOf(), '500')
            assert.equal((await this.master.totalAllocPoint()).valueOf(), '500')
        })

        it('should allow emergency withdraw', async () => {
            let currBlockCount = (await time.latestBlock()).toNumber();

            this.master = await YnetMasterChef.new(this.YnetToken.address, currBlockCount + 100, { from: alice })
            await this.YnetToken.transferOwnership(this.master.address, { from: alice })

            await this.master.add('100', this.lp1.address, 1000, true)
            await this.lp1.approve(this.master.address, '1000', { from: bob })

            await time.advanceBlockTo(currBlockCount + 110);
            await this.master.deposit(0, '100', constants.ZERO_ADDRESS, { from: bob })
            assert.equal((await this.lp1.balanceOf(bob)).valueOf(), '900')
            
            await this.master.emergencyWithdraw(0, { from: bob })
            assert.equal((await this.YnetToken.balanceOf(bob)).valueOf(), '0')  // bob's reward
            assert.equal((await this.lp1.balanceOf(bob)).valueOf(), '990')
        })

        it('should check the attack', async () => {
            let currBlockCount = (await time.latestBlock()).toNumber();

            this.master = await YnetMasterChef.new(this.YnetToken.address, currBlockCount + 100, { from: alice })
            // await this.YnetToken.transferOwnership(minter, { from: alice })
            await this.YnetToken.mint(bob, '1000', { from: alice })
            await this.YnetToken.mint(carol, '1000', { from: alice })
            await this.master.add('100', this.YnetToken.address, 1000, true);
            assert.equal((await this.YnetToken.balanceOf(bob)).valueOf(), '1000');
            assert.equal((await this.YnetToken.balanceOf(carol)).valueOf(), '1000');
            assert.equal((await this.YnetToken.totalSupply()).valueOf(), '2000');
            await this.YnetToken.approve(this.master.address, '1000', { from: bob })
            await this.YnetToken.approve(this.master.address, '1000', { from: carol })
            await this.YnetToken.transferOwnership(this.master.address, { from: alice })

            await this.master.setDevAddress(devAddress, { from: alice })
            await this.master.setFeeAddress(feeAddress, { from: alice })

            await time.advanceBlockTo(currBlockCount + 99);

            await this.master.deposit(0, '1000', constants.ZERO_ADDRESS, { from: bob })
            assert.equal((await this.YnetToken.balanceOf(bob)).valueOf(), '0');
            assert.equal((await this.YnetToken.balanceOf(this.master.address)).toString(), '882');

            await this.master.deposit(0, '1000', constants.ZERO_ADDRESS, { from: carol })
            assert.equal((await this.YnetToken.balanceOf(carol)).valueOf(), '0');

            // calculation for user.amont in pool.
            //1000 -2% (transfer tax on every transaction of YNet token) 0f 1000 = 980
            // 980 - 10%(pool deposit fee) of 980 = 882 
            await expectRevert(
                this.master.withdraw(0, '883', { from: bob }),
                'withdraw: not good')

            await this.master.withdraw(0, '882', { from: bob });

            assert(true, "User is unable to wihdraw the higher token amount then which is been recived by contract during his/her deposit .Not prone to attack happened!! ")
        })

        it('should allow LP tokens deposit & withdraw properly', async () => {
            let currBlockCount = (await time.latestBlock()).toNumber();

            this.master = await YnetMasterChef.new(this.YnetToken.address, currBlockCount + 100, { from: alice })
            await this.master.add(100, this.lp1.address, 500, true, { from: alice })

            await this.master.add(100, this.lp2.address, 1000, true, { from: alice })

            await this.lp1.approve(this.master.address, 1000, { from: alice })
            await this.lp1.approve(this.master.address, 1000, { from: bob })
            await this.lp1.approve(this.master.address, 1000, { from: carol })
            await this.lp1.approve(this.master.address, 1000, { from: dev })
            await this.lp1.approve(this.master.address, 1000, { from: eliah })

            await this.lp2.approve(this.master.address, 1000, { from: alice })
            await this.lp2.approve(this.master.address, 1000, { from: bob })
            await this.lp2.approve(this.master.address, 1000, { from: carol })
            await this.lp2.approve(this.master.address, 1000, { from: dev })
            await this.lp2.approve(this.master.address, 1000, { from: eliah })

            assert.equal((await this.lp1.allowance(alice, this.master.address)).valueOf(), '1000')
            assert.equal((await this.lp1.allowance(bob, this.master.address)).valueOf(), "1000")
            assert.equal((await this.lp1.allowance(carol, this.master.address)).valueOf(), '1000')
            assert.equal((await this.lp1.allowance(dev, this.master.address)).valueOf(), '1000')
            assert.equal((await this.lp1.allowance(eliah, this.master.address)).valueOf(), '1000')

            assert.equal((await this.lp2.allowance(alice, this.master.address)).valueOf(), '1000')
            assert.equal((await this.lp2.allowance(bob, this.master.address)).valueOf(), '1000')
            assert.equal((await this.lp2.allowance(dev, this.master.address)).valueOf(), '1000')
            assert.equal((await this.lp2.allowance(carol, this.master.address)).valueOf(), '1000')
            assert.equal((await this.lp2.allowance(eliah, this.master.address)).valueOf(), '1000')

            assert.equal((await this.lp1.balanceOf(this.master.address)).valueOf(), '0')
            assert.equal((await this.lp2.balanceOf(this.master.address)).valueOf(), '0')

            await this.master.setFeeAddress(feeAddress, { from: alice })
            await this.master.setDevAddress(devAddress, { from: alice })
            await this.YnetToken.transferOwnership(this.master.address, { from: alice })

            await time.advanceBlockTo(currBlockCount + 99);

            await this.master.deposit(0, '1000', constants.ZERO_ADDRESS, { from: alice })
            assert.equal((await this.lp1.balanceOf(this.master.address)).toString(), '950') // 1000 - 5% of 1000
            assert.equal((await this.lp1.balanceOf(await this.master.feeAddress.call())).valueOf(), '50') // 100 - 5% of 100

            await this.master.deposit(0, '1000', constants.ZERO_ADDRESS, { from: bob })
            await this.master.deposit(0, '1000', constants.ZERO_ADDRESS, { from: carol })
            await this.master.deposit(0, '1000', constants.ZERO_ADDRESS, { from: dev })
            await this.master.deposit(0, '1000', constants.ZERO_ADDRESS, { from: eliah })

            assert.equal((await this.lp1.balanceOf(this.master.address)).toString(), '4750') // 950* 5 
            assert.equal((await this.lp1.balanceOf(await this.master.feeAddress.call())).valueOf(), '250') // 50 * 5
            assert.equal((await this.lp1.balanceOf(bob)).valueOf(), '0')
            assert.equal((await this.lp1.balanceOf(carol)).valueOf(), '0')
            assert.equal((await this.lp1.balanceOf(dev)).valueOf(), '0')
            assert.equal((await this.lp1.balanceOf(eliah)).valueOf(), '0')

            await this.master.deposit(1, '1000', constants.ZERO_ADDRESS, { from: alice })
            assert.equal((await this.lp2.balanceOf(this.master.address)).toString(), '900') // 1000 - 10% of 1000
            assert.equal((await this.lp2.balanceOf(await this.master.feeAddress.call())).valueOf(), '100') // 100 - 5% of 100
            assert.equal((await this.lp2.balanceOf(alice)).valueOf(), '0')

            await this.master.deposit(1, '1000', constants.ZERO_ADDRESS, { from: bob })
            await this.master.deposit(1, '1000', constants.ZERO_ADDRESS, { from: carol })
            await this.master.deposit(1, '1000', constants.ZERO_ADDRESS, { from: dev })
            await this.master.deposit(1, '1000', constants.ZERO_ADDRESS, { from: eliah })

            assert.equal((await this.lp2.balanceOf(this.master.address)).toString(), '4500') // 900* 5 
            assert.equal((await this.lp2.balanceOf(await this.master.feeAddress.call())).valueOf(), '500') // 100 * 5
            assert.equal((await this.lp2.balanceOf(bob)).valueOf(), '0')
            assert.equal((await this.lp2.balanceOf(carol)).valueOf(), '0')
            assert.equal((await this.lp2.balanceOf(dev)).valueOf(), '0')
            assert.equal((await this.lp2.balanceOf(eliah)).valueOf(), '0')

            await this.master.withdraw(1, (await this.master.userInfo(1, alice)).amount.valueOf(), { from: alice })
            assert.equal((await this.lp2.balanceOf(this.master.address)).toString(), '3600') // 900* 5 

            await this.master.withdraw(1, (await this.master.userInfo(1, bob)).amount.valueOf(), { from: bob })
            await this.master.withdraw(1, (await this.master.userInfo(1, carol)).amount.valueOf(), { from: carol })
            await this.master.withdraw(1, (await this.master.userInfo(1, dev)).amount.valueOf(), { from: dev })
            await this.master.withdraw(1, (await this.master.userInfo(1, eliah)).amount.valueOf(), { from: eliah })

            assert.equal((await this.lp2.balanceOf(await this.master.feeAddress.call())).valueOf(), '500') //10% of 1000 for 5 users
            assert.equal((await this.lp2.balanceOf(this.master.address)).toString(), '0')

            assert.notEqual((await this.YnetToken.balanceOf(alice)).valueOf(), '0')
            assert.notEqual((await this.YnetToken.balanceOf(bob)).valueOf(), '0')
            assert.notEqual((await this.YnetToken.balanceOf(carol)).valueOf(), '0')
            assert.notEqual((await this.YnetToken.balanceOf(dev)).valueOf(), '0')
            assert.notEqual((await this.YnetToken.balanceOf(eliah)).valueOf(), '0')
            assert.notEqual((await this.YnetToken.balanceOf(this.master.address)).valueOf(), '0')


            await this.master.withdraw(0, (await this.master.userInfo(0, alice)).amount.valueOf(), { from: alice })
            assert.equal((await this.lp1.balanceOf(this.master.address)).toString(), '3800') // 950* 5 - 950 

            await this.master.withdraw(0, (await this.master.userInfo(0, bob)).amount.valueOf(), { from: bob })
            await this.master.withdraw(0, (await this.master.userInfo(0, carol)).amount.valueOf(), { from: carol })
            await this.master.withdraw(0, (await this.master.userInfo(0, dev)).amount.valueOf(), { from: dev })
            await this.master.withdraw(0, (await this.master.userInfo(0, eliah)).amount.valueOf(), { from: eliah })

            assert.equal((await this.lp1.balanceOf(await this.master.feeAddress.call())).valueOf(), '250') //5% of 1000 for 5 users
            assert.equal((await this.lp1.balanceOf(this.master.address)).toString(), '0')

            assert.notEqual((await this.YnetToken.balanceOf(alice)).valueOf(), '0')
            assert.notEqual((await this.YnetToken.balanceOf(bob)).valueOf(), '0')
            assert.notEqual((await this.YnetToken.balanceOf(carol)).valueOf(), '0')
            assert.notEqual((await this.YnetToken.balanceOf(dev)).valueOf(), '0')
            assert.notEqual((await this.YnetToken.balanceOf(eliah)).valueOf(), '0')

        })

        it('bad withdraw should fail ,trying to withdraw more then deposited', async () => {
            this.master = await YnetMasterChef.new(this.YnetToken.address, 100, { from: alice })
            await this.master.add(100, this.lp1.address, 500, true, { from: alice })

            await this.lp1.transfer(this.master.address, '5000', { from: minter })

            await this.lp1.approve(this.master.address, 1000, { from: alice })

            assert.equal((await this.lp1.allowance(alice, this.master.address)).valueOf(), '1000')

            await this.YnetToken.transferOwnership(this.master.address, { from: alice })

            await this.master.deposit(0, '100', constants.ZERO_ADDRESS, { from: alice })
            await this.master.deposit(0, '200', constants.ZERO_ADDRESS, { from: alice })
            await this.master.deposit(0, '300', constants.ZERO_ADDRESS, { from: alice })
            await this.master.deposit(0, '400', constants.ZERO_ADDRESS, { from: alice })

            await expectRevert(
                this.master.deposit(0, '1', constants.ZERO_ADDRESS, { from: alice }),
                'BEP20: transfer amount exceeds allowance')

            await this.master.withdraw(0, 500, { from: alice })
            await this.master.withdraw(0, 400, { from: alice })
            await this.master.withdraw(0, 50, { from: alice })

            await expectRevert(
                this.master.withdraw(0, 100, { from: alice }),
                'withdraw: not good')

        })

        it('should properly distribute tokens', async () => {

            this.master = await YnetMasterChef.new(this.YnetToken.address, 600, { from: alice })
            await this.YnetToken.transferOwnership(this.master.address, { from: alice })

            await this.master.setFeeAddress(feeAddress, { from: alice })
            await this.master.setDevAddress(devAddress, { from: alice })

            await this.master.add('100', this.lp1.address, 1000, true)
            await this.lp1.approve(this.master.address, '1000', { from: alice })
            await this.lp1.approve(this.master.address, '1000', { from: bob })
            await this.lp1.approve(this.master.address, '1000', { from: carol })
            await this.lp1.approve(this.master.address, '1000', { from: dev })

            await this.master.add('100', this.lp2.address, 500, true)
            await this.lp2.approve(this.master.address, '1000', { from: eliah })

            await time.advanceBlockTo('599')

            await this.master.deposit(0, 100, constants.ZERO_ADDRESS, { from: alice }) //600
            await this.master.deposit(0, 100, constants.ZERO_ADDRESS, { from: bob })   //601
            await this.master.deposit(0, 100, constants.ZERO_ADDRESS, { from: carol }) //602
            await this.master.deposit(0, 100, constants.ZERO_ADDRESS, { from: dev }) //603
            await this.master.deposit(1, 100, constants.ZERO_ADDRESS, { from: eliah }) //604

            await time.advanceBlockTo('649')

            await this.master.withdraw(0, 90, { from: alice })           //650
            assert.equal((await this.YnetToken.balanceOf(alice)).toString() / 1000000000000000000, 6.655833333333333);

            await this.master.withdraw(0, 90, { from: bob })             //651
            assert.equal((await this.YnetToken.balanceOf(bob)).toString() / 1000000000000000000, 6.329166666666667);

            await time.advanceBlockTo('653')

            await this.master.withdraw(1, 90, { from: eliah })           //554
            assert.equal((await this.YnetToken.balanceOf(eliah)).toString() / 1000000000000000000, 24.5);

            await expectRevert(
                this.master.withdraw(0, 5, { from: bob }),
                "withdraw: not good"
            )
        })

        it('should properly distribute at different deposit amounts', async () => {
            this.master = await YnetMasterChef.new(this.YnetToken.address, 700, { from: alice })
            await this.YnetToken.transferOwnership(this.master.address, { from: alice })

            await this.master.setFeeAddress(feeAddress, { from: alice })
            await this.master.setDevAddress(devAddress, { from: alice })

            await this.master.add('100', this.lp1.address, 1000, true)
            await this.lp1.approve(this.master.address, '1000', { from: alice })
            await this.lp1.approve(this.master.address, '1000', { from: bob })
            await this.lp1.approve(this.master.address, '1000', { from: carol })
            await this.lp1.approve(this.master.address, '1000', { from: dev })

            await this.master.add('100', this.lp2.address, 500, true)
            await this.lp2.approve(this.master.address, '1000', { from: eliah })

            
            await time.advanceBlockTo('699')
            await this.master.deposit(0, 10, constants.ZERO_ADDRESS, { from: alice })  //700
            await this.master.deposit(0, 20, constants.ZERO_ADDRESS, { from: bob })    //701
            await this.master.deposit(0, 30, constants.ZERO_ADDRESS, { from: carol })  //702
            await this.master.deposit(0, 40, constants.ZERO_ADDRESS, { from: dev })    //703
            await this.master.deposit(1, 10, constants.ZERO_ADDRESS, { from: eliah })  //704

            await time.advanceBlockTo('749')

            await this.master.withdraw(0, 9, { from: alice })            //750
            assert.equal((await this.YnetToken.balanceOf(alice)).toString() / 1000000000000000000, 3.038);

            await this.master.withdraw(0, 18, { from: bob })              //751  
            assert.equal((await this.YnetToken.balanceOf(bob)).toString() / 1000000000000000000, 5.204888888888889);

            await this.master.withdraw(0, 27, { from: carol })            //752
            
            assert.equal((await this.YnetToken.balanceOf(carol)).toString() / 1000000000000000000, 7.527333333333333);

            await time.advanceBlockTo('753')

            await this.master.withdraw(1, 9, { from: eliah })            //754
            
            assert.equal((await this.YnetToken.balanceOf(eliah)).toString() / 1000000000000000000, 24.5);
            
        })

        it('should distribute properly when multiple deposit and partial withdraw', async () => {
            this.master = await YnetMasterChef.new(this.YnetToken.address, 800, { from: alice })
            await this.YnetToken.transferOwnership(this.master.address, { from: alice })

            await this.master.add('100', this.lp1.address, 1000, true)

            await this.lp1.approve(this.master.address, '1000', { from: bob })
            await this.lp1.approve(this.master.address, '1000', { from: carol })

            await this.master.add('100', this.lp2.address, 1000, true)

            await time.advanceBlockTo('799')

            await this.master.deposit(0, 100, constants.ZERO_ADDRESS, { from: bob }) // 800 

            await this.master.deposit(0, 100, constants.ZERO_ADDRESS, { from: carol }) // 801

            await time.advanceBlockTo('850')
            await this.master.deposit(0, 100, constants.ZERO_ADDRESS, { from: bob }) // 851

            assert.equal((await this.YnetToken.balanceOf(bob)).toString() / 1000000000000000000, 12.74)

            await time.advanceBlockTo('900')
            await this.master.withdraw(0, 90, { from: bob }) // 901

            assert.equal((await this.YnetToken.balanceOf(bob)).toString() / 1000000000000000000, 29.07333333333333);

            await this.master.withdraw(0, 90, { from: carol }) // 902
            assert.equal((await this.YnetToken.balanceOf(carol)).toString() / 1000000000000000000, 20.66166666666667)
        })

        it('check if rewards are generated before start block', async () => {
            this.master = await YnetMasterChef.new(this.YnetToken.address, 600, { from: alice })
            await this.YnetToken.transferOwnership(this.master.address, { from: alice })
            await this.master.setDevAddress(devAddress, { from: alice })

            await this.master.add(100, this.lp1.address, 0, true)
            await this.lp1.approve(this.master.address, '1000', { from: bob })
            await this.lp1.approve(this.master.address, '1000', { from: carol })

            await time.advanceBlockTo('499')
            await this.master.deposit(0, 1000, constants.ZERO_ADDRESS, { from: bob }) //600

            await time.advanceBlockTo('599')
            await this.master.withdraw(0, 1000, { from: bob }) //700

            assert.equal((await this.YnetToken.balanceOf(bob)).toString(), 0)

        })

        it('should check devAddress percentage', async () => {
            this.master = await YnetMasterChef.new(this.YnetToken.address, 600, { from: alice })
            await this.YnetToken.transferOwnership(this.master.address, { from: alice })
            await this.master.setDevAddress(devAddress, { from: alice })

            await this.master.add(100, this.lp1.address, 0, true)
            await this.lp1.approve(this.master.address, '1000', { from: bob })
            await this.lp1.approve(this.master.address, '1000', { from: carol })

            await time.advanceBlockTo('599')
            await this.master.deposit(0, 1000, constants.ZERO_ADDRESS, { from: bob }) //600

            await time.advanceBlockTo('649')
            await this.master.deposit(0, 1000, constants.ZERO_ADDRESS, { from: carol }) //600

            await time.advanceBlockTo('699')
            await this.master.withdraw(0, 1000, { from: bob }) //650

            await time.advanceBlockTo('749')
            await this.master.withdraw(0, 1000, { from: carol }) //650

            // 15 * 100 / 165
            assert.equal((await this.YnetToken.balanceOf(devAddress)).toString() * 100 /
                (await this.YnetToken.totalSupply()).toString(), 9.090909090909092)


        })
    })
})