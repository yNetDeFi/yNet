const { expectRevert, time, constants, BN } = require('@openzeppelin/test-helpers')
const { assert } = require("chai");
const YnetMasterChef = artifacts.require('YnetMasterChef')
const YnetToken = artifacts.require('YnetToken')
const YNetReferral = artifacts.require('YNetReferral');
const MockBEP20 = artifacts.require('MockBEP20')

contract('YNetReferral', ([alice, bob, carol, referrer, operator, owner, minter, dev, feeAddress, devAddress]) => {
    beforeEach(async () => {
        this.YNetReferral = await YNetReferral.new({ from: owner });
        this.YnetToken = await YnetToken.new({ from: alice })
        this.master = await YnetMasterChef.new(this.YnetToken.address, 100, { from: alice })
        this.lp2 = await MockBEP20.new('Token2', 'TK2', '10000000000', { from: minter })
        this.lp1 = await MockBEP20.new('Token1', 'TK1', '10000000000', { from: minter })
        await this.lp1.transfer(alice, '1000', { from: minter })
        await this.lp1.transfer(bob, '1000', { from: minter })
        await this.lp2.transfer(alice, '1000', { from: minter })
        await this.lp2.transfer(bob, '1000', { from: minter })
    });

    it('should allow operator and only owner to update operator', async () => {
        assert.equal((await this.YNetReferral.operators(operator)).valueOf(), false);
        await expectRevert(this.YNetReferral.recordReferral(alice, referrer, { from: operator }), 'Operator: caller is not the operator');

        await expectRevert(this.YNetReferral.updateOperator(operator, true, { from: carol }), 'Ownable: caller is not the owner');
        await this.YNetReferral.updateOperator(operator, true, { from: owner });
        assert.equal((await this.YNetReferral.operators(operator)).valueOf(), true);

        await this.YNetReferral.updateOperator(operator, false, { from: owner });
        assert.equal((await this.YNetReferral.operators(operator)).valueOf(), false);
        await expectRevert(this.YNetReferral.recordReferral(alice, referrer, { from: operator }), 'Operator: caller is not the operator');
    });

    it('record referral', async () => {
        assert.equal((await this.YNetReferral.operators(operator)).valueOf(), false);
        await this.YNetReferral.updateOperator(operator, true, { from: owner });
        assert.equal((await this.YNetReferral.operators(operator)).valueOf(), true);

        await this.YNetReferral.recordReferral(constants.ZERO_ADDRESS, referrer, { from: operator });
        await this.YNetReferral.recordReferral(alice, constants.ZERO_ADDRESS, { from: operator });
        await this.YNetReferral.recordReferral(constants.ZERO_ADDRESS, constants.ZERO_ADDRESS, { from: operator });
        await this.YNetReferral.recordReferral(alice, alice, { from: operator });
        assert.equal((await this.YNetReferral.getReferrer(alice)).valueOf(), constants.ZERO_ADDRESS);
        assert.equal((await this.YNetReferral.referralsCount(referrer)).valueOf(), '0');

        await this.YNetReferral.recordReferral(alice, referrer, { from: operator });
        assert.equal((await this.YNetReferral.getReferrer(alice)).valueOf(), referrer);
        assert.equal((await this.YNetReferral.referralsCount(referrer)).valueOf(), '1');

        assert.equal((await this.YNetReferral.referralsCount(bob)).valueOf(), '0');
        await this.YNetReferral.recordReferral(alice, bob, { from: operator });
        assert.equal((await this.YNetReferral.referralsCount(bob)).valueOf(), '0');
        assert.equal((await this.YNetReferral.getReferrer(alice)).valueOf(), referrer);

        await this.YNetReferral.recordReferral(carol, referrer, { from: operator });
        assert.equal((await this.YNetReferral.getReferrer(carol)).valueOf(), referrer);
        assert.equal((await this.YNetReferral.referralsCount(referrer)).valueOf(), '2');
    });
    
    it('multiple referrers should not be added for a user', async () => {
        await this.YnetToken.transferOwnership(this.master.address, { from: alice }) 

        await this.master.add('100', this.lp1.address,1000, true)
        await this.lp1.approve(this.master.address, '1000', { from: alice })
        await this.lp1.approve(this.master.address, '1000', { from: bob })

        await this.master.add('100', this.lp2.address,500, true)

        await expectRevert(
             this.master.setYnetReferral(this.YNetReferral.address,{from :bob }),
            "Ownable: caller is not the owner")

        await this.master.setYnetReferral(this.YNetReferral.address,{from :alice })
        
        //MasterChef must be added as operator for adding the referal information.
        await this.YNetReferral.updateOperator(this.master.address, true, { from: owner });

        await this.master.deposit(0, 10,carol, { from: alice }) 
        
        await this.master.deposit(0, 10,constants.ZERO_ADDRESS, { from: bob }) 

        await this.master.deposit(0, 10,dev, { from: alice })

        await this.master.deposit(0, 1,minter, { from: bob }) 

        await this.master.deposit(0, 1,dev, { from: bob })  

        await this.master.withdraw(0,18, { from: alice }) 
        await this.master.withdraw(0,9, { from: bob }) 
        assert.equal((await this.YNetReferral.getReferrer(alice)) , carol)
        assert.equal((await this.YNetReferral.getReferrer(bob)) , minter)
    
    })

    it('Referal Reward Calculation', async () => {

        await this.YnetToken.transferOwnership(this.master.address, { from: alice })
        
        await this.master.add('100', this.lp1.address, 1000, true)
        await this.lp1.approve(this.master.address, '1000', { from: alice })
        await this.lp1.approve(this.master.address, '1000', { from: bob })
        
        await this.master.add('100', this.lp2.address, 500, true)
        await expectRevert(
            this.master.setYnetReferral(this.YNetReferral.address, { from: bob }),
            "Ownable: caller is not the owner")
        await this.master.setYnetReferral(this.YNetReferral.address, { from: alice })
        //MasterChef must be added as operator for adding the referal information.
        await this.YNetReferral.updateOperator(this.master.address, true, { from: owner });
        await this.master.setFeeAddress(feeAddress, { from: alice })
        await this.master.setDevAddress(devAddress, { from: alice })
        await time.advanceBlockTo('99')

        await this.master.deposit(0, 100, carol, { from: alice })       // 800
        await this.master.deposit(0, 100, dev, { from: bob })         // 801

        await time.advanceBlockTo('150')

        await this.master.deposit(0, 100, dev, { from: alice })    // 151, No change will be made in referrer
        // Rewards generated at 151 is 13 ynet, 2% of 13 = 0.26 ynet

        console.log("Reward of alice after 2nd deposit: ", (await this.YnetToken.balanceOf(alice)).toString() / 1000000000000000000)
        console.log("Referral Reward of carol after 2nd deposit: ", (await this.YnetToken.balanceOf(carol)).toString() / 1000000000000000000)
        console.log("Referral Reward of dev after 2nd deposit: ", (await this.YnetToken.balanceOf(dev)).toString() / 1000000000000000000)

        await time.advanceBlockTo('200')
        await this.master.withdraw(0, 90, { from: alice }) // 201
        // pending Rewards of alice at 201 is 50/3 ynet, 2% of 50/3 = 1/3.
        // 1/3 + 0.26 = 0.59333333333333 referral commission of carol.
 
        console.log("Referral Reward of carol after withdraw by alice: ", (await this.YnetToken.balanceOf(carol)).toString() / 1000000000000000000)
        console.log("Referral Reward of dev after withdraw by alice: ", (await this.YnetToken.balanceOf(dev)).toString() / 1000000000000000000)

        
        await this.master.withdraw(0, 90, { from: bob }) // 202
        // pending rewards of bob at 202 is 253/12 ynet, 2% of 253/12 = 0.421666666.
        

        console.log("Referral Reward of dev after withdraw by bob: ", (await this.YnetToken.balanceOf(dev)).toString() / 1000000000000000000)
        
        assert.equal((await this.YnetToken.balanceOf(carol)).toString() / 1000000000000000000, 0.5933333333333334)
        assert.equal((await this.YnetToken.balanceOf(dev)).toString() / 1000000000000000000, 0.4216666666666667)
        
    })
});
