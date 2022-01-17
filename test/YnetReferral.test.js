const { expectRevert, time, constants, BN } = require('@openzeppelin/test-helpers')
const { assert } = require("chai");
const YnetMasterChef = artifacts.require('YnetMasterChef')
const YnetToken = artifacts.require('YnetToken')
const YNetReferral = artifacts.require('YNetReferral');
const MockBEP20 = artifacts.require('MockBEP20')

contract('YNetReferral', ([alice, bob, carol, referrer, operator, owner, minter, dev, feeAddress, devAddress]) => {
    beforeEach(async () => {
        this.YNetReferral = await YNetReferral.new({ from: owner });
        this.YnetToken = await YnetToken.new({ from: owner })
        this.master = await YnetMasterChef.new(this.YnetToken.address, 100, { from: owner })
        this.lp1 = await MockBEP20.new('Token1', 'TK1', '10000000000', { from: minter })
        this.lp2 = await MockBEP20.new('Token2', 'TK2', '10000000000', { from: minter })

        await this.lp1.transfer(alice, '1000', { from: minter })
        await this.lp1.transfer(bob, '1000', { from: minter })
        await this.lp2.transfer(alice, '1000', { from: minter })
        await this.lp2.transfer(bob, '1000', { from: minter })
    });

    it('should allow operator and only owner to update operator', async () => {
        assert.equal((await this.YNetReferral.operators(operator)).valueOf(), false);
        await expectRevert(
            this.YNetReferral.recordReferral(alice, referrer, { from: operator }), 
            'Operator: caller is not the operator'
        );

        await expectRevert(
            this.YNetReferral.updateOperator(operator, true, { from: carol }),
             'Ownable: caller is not the owner'
        );

        await this.YNetReferral.updateOperator(operator, true, { from: owner });
        assert.equal((await this.YNetReferral.operators(operator)).valueOf(), true);

        await this.YNetReferral.updateOperator(operator, false, { from: owner });
        assert.equal((await this.YNetReferral.operators(operator)).valueOf(), false);
        await expectRevert(
            this.YNetReferral.recordReferral(alice, referrer, { from: operator }),
             'Operator: caller is not the operator'
        );
    });

    it('should record referral properly', async () => {
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
    
    it('should not allow multiple referrers for a user', async () => {
        await this.YnetToken.transferOwnership(this.master.address, { from: owner }) 

        await this.master.add('100', this.lp1.address,200, true, { from: owner })
        await this.lp1.approve(this.master.address, '1000', { from: alice })
        await this.lp1.approve(this.master.address, '1000', { from: bob })

        await this.master.add('100', this.lp2.address,200, true, { from: owner })

        await expectRevert(
             this.master.setYnetReferral(this.YNetReferral.address,{from :bob }),
            "Ownable: caller is not the owner"
        )

        await this.master.setYnetReferral(this.YNetReferral.address,{from :owner })
        
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

    it('should calculate referral reward properly', async () => {

        await this.YnetToken.transferOwnership(this.master.address, { from: owner })
        
        await this.master.add('100', this.lp1.address, 200, true, { from: owner })
        await this.lp1.approve(this.master.address, '1000', { from: alice })
        await this.lp1.approve(this.master.address, '1000', { from: bob })
        
        await this.master.add('100', this.lp2.address, 400, true, { from: owner })

        await expectRevert(
            this.master.setYnetReferral(this.YNetReferral.address, { from: bob }),
            "Ownable: caller is not the owner"
        )

        await this.master.setYnetReferral(this.YNetReferral.address, { from: owner })
        //MasterChef must be added as operator for adding the referal information.
        await this.YNetReferral.updateOperator(this.master.address, true, { from: owner });
        await this.master.setFeeAddress(feeAddress, { from: owner })
        await this.master.setDevAddress(devAddress, { from: owner })

        await time.advanceBlockTo('99')

        await this.master.deposit(0, 100, carol, { from: alice })       // 100
        await this.master.deposit(0, 100, dev, { from: bob })           // 101

        await time.advanceBlockTo('150')

        await this.master.deposit(0, 100, dev, { from: alice })    // 151, No change will be made in referrer

        assert.equal((await this.YnetToken.balanceOf(alice)).valueOf(),120)
        assert.equal((await this.YnetToken.balanceOf(carol)).valueOf(),2)
        assert.equal((await this.YnetToken.balanceOf(dev)).valueOf(),0)

        await time.advanceBlockTo('200')
        await this.master.withdraw(0, 98, { from: alice }) // 201

        assert.equal((await this.YnetToken.balanceOf(alice)).valueOf(),275)
        assert.equal((await this.YnetToken.balanceOf(carol)).valueOf(),5)
        assert.equal((await this.YnetToken.balanceOf(dev)).valueOf(),0)

        await expectRevert(
            this.master.setReferralCommissionRate(2500,{from:owner}),
            "setReferralCommissionRate: invalid referral commission rate basis points"
        )
        
        await this.master.setReferralCommissionRate(400,{from:owner}),


        await this.master.withdraw(0, 98, { from: bob }) // 202

        assert.equal((await this.YnetToken.balanceOf(dev)).valueOf(),8)
        
        assert.equal((await this.YnetToken.balanceOf(alice)).valueOf(),275)
        assert.equal((await this.YnetToken.balanceOf(bob)).valueOf(),200)
        assert.equal((await this.YnetToken.balanceOf(carol)).valueOf() , 5)
        assert.equal((await this.YnetToken.balanceOf(dev)).valueOf() , 8)
        
    })

    it('should allow drain of any tokens sent to contract', async () => {
        await this.YNetReferral.updateOperator(operator, true, { from: owner });
        assert.equal((await this.YNetReferral.operators(operator)).valueOf(), true);

        await this.lp1.transfer(this.YNetReferral.address, '1000', { from: alice })

        assert.equal(await this.lp1.balanceOf(alice),0)

        await this.YNetReferral.drainBEP20Token(this.lp1.address,1000,alice,{from:owner})

        assert.equal(await this.lp1.balanceOf(alice),1000)

    })

});