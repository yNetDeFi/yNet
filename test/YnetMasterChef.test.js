const { expectRevert, time, constants } = require('@openzeppelin/test-helpers')
const YnetToken = artifacts.require('YnetToken')
const { assert } = require("chai");
const YnetMasterChef = artifacts.require('YnetMasterChef')
const MockBEP20 = artifacts.require('MockBEP20')

contract('YnetMasterChef', ([owner, alice, bob, carol, dev, eliah,minter]) => {
    beforeEach(async () => {
        this.YnetToken = await YnetToken.new({ from: owner })
    })

    it('start block should not be ahead by 30 days of current block number', async () => {
        this.master = await YnetMasterChef.new(this.YnetToken.address, 100, { from: alice })
        await this.master.add('200', this.YnetToken.address,200, true, { from: alice })
        assert.equal((await this.master.poolInfo(0)).lastRewardBlock.valueOf(), 100)

        await expectRevert(
            this.master.updateStartBlock(864500, { from: alice }),
            "Start block should not be more than 30 days ahead of current block")
        await expectRevert(
                this.master.updateStartBlock(2500, { from: bob }),
            "Ownable: caller is not the owner")
        await this.master.updateStartBlock(2500, { from: alice });

        assert.equal((await this.master.startBlock()).valueOf(), 2500)
        assert.equal((await this.master.poolInfo(0)).lastRewardBlock.valueOf(), 2500)

    })


    it('should set correct state variables', async () => {
        this.master = await YnetMasterChef.new(this.YnetToken.address,100, { from: owner })

        assert.equal((await this.master.ynet()).valueOf(), this.YnetToken.address)
        assert.equal((await this.master.devAddress()).valueOf(), owner)
        assert.equal((await this.master.feeAddress()).valueOf(), owner)
        assert.equal((await this.master.ynetPerBlock()).valueOf(), 10)
        assert.equal((await this.master.INITIAL_EMISSION_RATE()).valueOf(), 10)
        assert.equal((await this.master.MINIMUM_EMISSION_RATE()).valueOf(), 1)
        assert.equal((await this.master.EMISSION_REDUCTION_PERIOD_BLOCKS()).valueOf(), 100)
        assert.equal((await this.master.EMISSION_REDUCTION_RATE_PER_PERIOD()).valueOf(), 5000)
        assert.equal((await this.master.startBlock()).valueOf(), 100)
        assert.equal((await this.master.referralCommissionRate()).valueOf(), 200)
        assert.equal((await this.master.MAXIMUM_REFERRAL_COMMISSION_RATE()).valueOf(), 2000)
    })

    context('With LP token added to the field', () => {
        beforeEach(async () => {
            this.lp = await MockBEP20.new('Token1', 'TK1', '10000000000', { from: minter })
            await this.lp.transfer(alice, '1000', { from: minter })
            await this.lp.transfer(bob, '1000', { from: minter })
            await this.lp.transfer(carol, '1000', { from: minter })
            await this.lp.transfer(dev, '1000', { from: minter })
            await this.lp.transfer(eliah, '1000', { from: minter })
            this.lp2 = await MockBEP20.new('Token2', 'TK2', '10000000000', { from: minter })
            await this.lp2.transfer(alice, '1000', { from: minter })
            await this.lp2.transfer(bob, '1000', { from: minter })
            await this.lp2.transfer(carol, '1000', { from: minter })
            await this.lp2.transfer(dev, '1000', { from: minter })
            await this.lp2.transfer(eliah, '1000', { from: minter })
        })

        it('should correct add new pool and set pool', async () => {
            // 10 per block, start at block 100
            this.master = await YnetMasterChef.new(this.YnetToken.address, 100,{ from: owner })

            await this.master.add('100', this.lp.address,200, true, { from: owner})
            assert.equal((await this.master.poolInfo(0)).lpToken.valueOf(), this.lp.address)
            assert.equal((await this.master.poolInfo(0)).allocPoint.valueOf(), '100')
            assert.equal((await this.master.poolInfo(0)).lastRewardBlock.valueOf(), '100')
            assert.equal((await this.master.poolInfo(0)).accYnetPerShare.valueOf(), '0')
            assert.equal((await this.master.poolInfo(0)).depositFeeBP.valueOf(), '200')

            await expectRevert(
                this.master.add('100', this.lp2.address,300, true, { from: bob}),
                "Ownable: caller is not the owner"
            )
            await expectRevert(
                this.master.add('100', this.lp2.address,1000, true, { from: owner}),
                "add: invalid deposit fee basis points"
            )

            await this.master.add('300', this.lp2.address,400, true, { from: owner})
            assert.equal((await this.master.poolInfo(1)).lpToken.valueOf(), this.lp2.address)
            assert.equal((await this.master.poolInfo(1)).allocPoint.valueOf(), '300')
            assert.equal((await this.master.poolInfo(1)).lastRewardBlock.valueOf(), '100')
            assert.equal((await this.master.poolInfo(1)).accYnetPerShare.valueOf(), '0')
            assert.equal((await this.master.poolInfo(1)).depositFeeBP.valueOf(), '400')

            assert.equal((await this.master.totalAllocPoint()).valueOf(), '400')

            await this.master.set(1, 400,100, true, { from: owner})
            assert.equal((await this.master.poolInfo(1)).allocPoint.valueOf(), '400')
            assert.equal((await this.master.poolInfo(1)).depositFeeBP.valueOf(), '100')
            assert.equal((await this.master.totalAllocPoint()).valueOf(), '500')

            assert.equal((await this.master.poolLength()).valueOf(), '2')
        })

        it('should allow emergency withdraw', async () => {
            this.master = await YnetMasterChef.new(this.YnetToken.address, 100, { from: owner })

            await this.master.add('100', this.lp.address,200, true)
            await this.lp.approve(this.master.address, '1000', { from: bob })

            await time.advanceBlockTo(110);
            await this.master.deposit(0, '100',constants.ZERO_ADDRESS, { from: bob })
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), '900')
            await this.master.emergencyWithdraw(0, { from: bob })
            assert.equal((await this.YnetToken.balanceOf(bob)).valueOf(), '0')
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), '998')
        })

        it('should correct deposit', async () => {
           this.master = await YnetMasterChef.new(this.YnetToken.address, 150, { from: owner })
           await this.YnetToken.transferOwnership(this.master.address, { from: owner })


            await this.master.add('200', this.lp.address,200, true)
            await this.master.add('200', this.lp2.address,0, true)
            await this.lp.approve(this.master.address, '1000', { from: bob })
            await this.lp2.approve(this.master.address, '1000', { from: carol })  
        
            await this.master.deposit(0, 100,constants.ZERO_ADDRESS, { from: bob })
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), '900')
            assert.equal((await this.lp.balanceOf(this.master.address)).valueOf(), '98')

            await time.advanceBlockTo(160);
            assert.equal((await this.master.pendingYnet(0, bob)).valueOf(), "49")
            assert.equal((await this.master.userInfo(0, bob)).rewardDebt.valueOf(), "0")
            assert.equal((await this.master.poolInfo(0)).accYnetPerShare.valueOf(), "0")

            await this.master.deposit(1, 50,constants.ZERO_ADDRESS, { from: carol })
            assert.equal((await this.lp2.balanceOf(carol)).valueOf(), '950')
            assert.equal((await this.lp2.balanceOf(this.master.address)).valueOf(), '50')

        })

        it('should calculate correct pending YnetToken & balance', async () => {
            // 10 per block farming rate starting at block 200
            this.master = await YnetMasterChef.new(this.YnetToken.address, 200, { from: owner })
            await this.YnetToken.transferOwnership(this.master.address, { from: owner })

            await this.master.add('200', this.lp.address,200, true)
            await this.master.add('200', this.lp2.address,400, true)
            await this.lp.approve(this.master.address, '1000', { from: bob })
            await this.lp.approve(this.master.address, '1000', { from: carol })

            await time.advanceBlockTo(199);
        
            await this.master.deposit(0, 100,constants.ZERO_ADDRESS, { from: bob })
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), '900')
            assert.equal((await this.lp.balanceOf(this.master.address)).valueOf(), '98')

            await time.advanceBlockTo(210);
            assert.equal((await this.master.pendingYnet(0, bob)).valueOf(), '49')
            await time.advanceBlockTo(220)
            assert.equal((await this.master.pendingYnet(0, bob)).valueOf(), '99')

            await time.advanceBlockTo(249)
            await this.master.updatePool(0) //250
            assert.equal((await this.YnetToken.totalSupply()).valueOf(), '275')

            await time.advanceBlockTo(259)
            await this.master.deposit(0, 100,constants.ZERO_ADDRESS, { from: bob }) //260
            assert.equal((await this.master.pendingYnet(0, bob)).valueOf(), '0') // when deposit, it will automatic harvest
            assert.equal((await this.YnetToken.balanceOf(bob)).valueOf(),'277')

            assert.equal((await this.YnetToken.balanceOf(this.master.address)).valueOf(), "1")

            await time.advanceBlockTo(270)
            assert.equal((await this.master.pendingYnet(0, bob)).valueOf(), '50')

            await time.advanceBlockTo(280)
            assert.equal((await this.master.pendingYnet(0, bob)).valueOf(), '100')

            await time.advanceBlockTo(299)
            await this.master.deposit(0, 100,constants.ZERO_ADDRESS, { from: carol }) // 300
            assert.equal((await this.master.pendingYnet(0, bob)).valueOf(), '200')
            assert.equal((await this.master.pendingYnet(0, carol)).valueOf(), '0')
            
            await time.advanceBlockTo(310)
            assert.equal((await this.master.pendingYnet(0, bob)).valueOf(), '234')
            assert.equal((await this.master.pendingYnet(0, carol)).valueOf(), '17')

            await time.advanceBlockTo(320)
            assert.equal((await this.master.pendingYnet(0, bob)).valueOf(), '267')
            assert.equal((await this.master.pendingYnet(0, carol)).valueOf(), '34') 
        })

        it('should not distribute YnetToken if no one deposit', async () => {
            // 10 per block farming rate starting at block 400 
            this.master = await YnetMasterChef.new(this.YnetToken.address, 400, { from: owner })
            await this.YnetToken.transferOwnership(this.master.address, { from: owner })

            await this.master.add('100', this.lp.address,200, true)
            await this.master.add('100', this.lp2.address,400, true)

            await this.lp.approve(this.master.address, '1000', { from: bob })
            await time.advanceBlockTo('430')
            assert.equal((await this.YnetToken.totalSupply()).valueOf(), '0')
            await time.advanceBlockTo('440')
            assert.equal((await this.YnetToken.totalSupply()).valueOf(), '0')
            await time.advanceBlockTo('450')
            await this.master.updatePool(0) 
            assert.equal((await this.YnetToken.totalSupply()).valueOf(), '0')
            assert.equal((await this.YnetToken.balanceOf(bob)).valueOf(), '0')
            assert.equal((await this.YnetToken.balanceOf(dev)).valueOf(), '0')
            await time.advanceBlockTo('459')
            await this.master.deposit(0, '100',constants.ZERO_ADDRESS, { from: bob }) 
            assert.equal((await this.lp.balanceOf(this.master.address)).valueOf(), '98')
            assert.equal((await this.YnetToken.totalSupply()).valueOf(), '0')
            assert.equal((await this.YnetToken.balanceOf(bob)).valueOf(), '0')
            assert.equal((await this.YnetToken.balanceOf(dev)).valueOf(), '0')
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), '900')

            await time.advanceBlockTo('479')
            await this.master.withdraw(0,'50', { from: bob })
            assert.equal(await this.YnetToken.balanceOf(bob).valueOf(),'92')
        })

        it('should properly distribute reward tokens', async () => {
            
           this.master = await YnetMasterChef.new(this.YnetToken.address, 600, { from: owner })
           await this.YnetToken.transferOwnership(this.master.address, { from: owner })

            await this.master.add('100', this.lp.address,200, true)
            await this.lp.approve(this.master.address, '1000', { from: alice })
            await this.lp.approve(this.master.address, '1000', { from: bob })
            await this.lp.approve(this.master.address, '1000', { from: carol })
            await this.lp.approve(this.master.address, '1000', { from: dev })

            await this.master.add('100', this.lp2.address,400, true)
            await this.lp2.approve(this.master.address, '1000', { from: eliah })

            await time.advanceBlockTo('550')
            await this.master.deposit(0, 100,constants.ZERO_ADDRESS, { from: alice }) 
            await this.master.deposit(0, 100,constants.ZERO_ADDRESS, { from: bob })   
            await this.master.deposit(0, 100,constants.ZERO_ADDRESS, { from: carol }) 
            await this.master.deposit(0, 100,constants.ZERO_ADDRESS, { from: dev })   

            await this.master.deposit(1, 100,constants.ZERO_ADDRESS, { from: eliah }) 

          // ----- claiming anytime after sale start 
            await time.advanceBlockTo('649')

            await this.master.withdraw(0,98, { from: alice })           
            assert.equal(await this.YnetToken.balanceOf(alice),'58');

            await this.master.withdraw(0,98, { from: bob })             
            assert.equal(await this.YnetToken.balanceOf(bob),'60');

            await this.master.withdraw(0,98, { from: carol })           
            assert.equal(await this.YnetToken.balanceOf(carol),'62');

            await this.master.withdraw(0,98, { from: dev })             
            assert.equal(await this.YnetToken.balanceOf(dev),'66');

            await this.master.withdraw(1,96, { from: eliah })           
            assert.equal(await this.YnetToken.balanceOf(eliah),'250');          

            await expectRevert(
                this.master.withdraw(0,5, { from: bob }),
                "withdraw: not good"
            )

        })

        it('should properly distribute reward tokens at different deposit amounts', async () => {
            this.master = await YnetMasterChef.new(this.YnetToken.address, 700, { from: owner })
            await this.YnetToken.transferOwnership(this.master.address, { from: owner })
 
             await this.master.add('100', this.lp.address,200, true)
             await this.lp.approve(this.master.address, '1000', { from: alice })
             await this.lp.approve(this.master.address, '1000', { from: bob })
             await this.lp.approve(this.master.address, '1000', { from: carol })
             await this.lp.approve(this.master.address, '1000', { from: dev })
 
             await this.master.add('100', this.lp2.address,400, true)
             await this.lp2.approve(this.master.address, '1000', { from: eliah })

             // assert.equal(await time.latestBlock());
             await time.advanceBlockTo('690')
             await this.master.deposit(0, 100,constants.ZERO_ADDRESS, { from: alice })  
             await this.master.deposit(0, 200,constants.ZERO_ADDRESS, { from: bob })   
             await this.master.deposit(0, 300,constants.ZERO_ADDRESS, { from: carol })
             await this.master.deposit(0, 400,constants.ZERO_ADDRESS, { from: dev })   
             await this.master.deposit(1, 100,constants.ZERO_ADDRESS, { from: eliah }) 
 

             await time.advanceBlockTo('749')

             await this.master.withdraw(0,98, { from: alice })            //750
             assert.equal(await this.YnetToken.balanceOf(alice),'23');

             await this.master.withdraw(0,196, { from: bob })              //751
             assert.equal(await this.YnetToken.balanceOf(bob),'48');

             await this.master.withdraw(0,294, { from: carol })            //752
             assert.equal(await this.YnetToken.balanceOf(carol),'73');

            await this.master.withdraw(0,392, { from: dev })              //753
            assert.equal(await this.YnetToken.balanceOf(dev),'102');

            await this.master.withdraw(1,96, { from: eliah })            //754
            assert.equal(await this.YnetToken.balanceOf(eliah),'250');
        })

        it('should allow deposit and partial withdraw at any time', async () => {
            this.master = await YnetMasterChef.new(this.YnetToken.address,1000, { from: owner })
            await this.YnetToken.transferOwnership(this.master.address, { from: owner })
 
             await this.master.add('100', this.lp.address,200, true)
             await this.lp.approve(this.master.address, '1000', { from: alice })
             await this.lp.approve(this.master.address, '1000', { from: bob })
             await this.lp.approve(this.master.address, '1000', { from: carol })
             await this.lp.approve(this.master.address, '1000', { from: dev })
 
             await this.master.add('100', this.lp2.address,200, true)
             await this.lp2.approve(this.master.address, '1000', { from: eliah })

             // assert.equal(await time.latestBlock());
             await time.advanceBlockTo('1150')
             await this.master.deposit(0, 100,constants.ZERO_ADDRESS, { from: alice })
             await this.master.deposit(0, 100,constants.ZERO_ADDRESS, { from: bob })    
             await this.master.deposit(1, 100,constants.ZERO_ADDRESS, { from: eliah })  

             await time.advanceBlockTo('1200')
             await this.master.deposit(0, 100,constants.ZERO_ADDRESS, { from: alice }) 

             await time.advanceBlockTo('1250')
             await this.master.withdraw(0,98, { from: alice })            
             assert.equal(await this.YnetToken.balanceOf(alice),'273');

             await this.master.withdraw(0,98, { from: bob })             
             assert.equal(await this.YnetToken.balanceOf(bob),'194');
             
            await this.master.withdraw(1,98, { from: eliah })           
            assert.equal(await this.YnetToken.balanceOf(eliah),'462');

            await time.advanceBlockTo('1300')
            await this.master.deposit(0, 100,constants.ZERO_ADDRESS, { from: carol }) 
            await this.master.deposit(0, 100,constants.ZERO_ADDRESS, { from: dev })

            await time.advanceBlockTo('1350')
            await this.master.withdraw(0,98, { from: carol })            
            assert.equal(await this.YnetToken.balanceOf(carol),'78');

            await this.master.withdraw(0,98, { from: alice })  
            assert.equal(await this.YnetToken.balanceOf(alice),'582');
        })

        
        it('should allow original fee address to change feeAddress', async () => {
            this.master = await YnetMasterChef.new(this.YnetToken.address, 1700, { from: owner })
            await this.YnetToken.transferOwnership(this.master.address, { from: owner })
            
            await expectRevert(
                this.master.setFeeAddress(dev, { from: alice }),
                "setFeeAddress: FORBIDDEN"    
            )
            await expectRevert(
                this.master.setFeeAddress(constants.ZERO_ADDRESS, { from: owner }),
                "setFeeAddress: cannot set fee adddres to zero address"    
            )
            await this.master.setFeeAddress(eliah, { from: owner })
            assert.equal(await this.lp.balanceOf(eliah),'1000');

            await this.master.add('100', this.lp.address,200, true)
            await this.lp.approve(this.master.address, '1000', { from: alice })
            await this.lp.approve(this.master.address, '1000', { from: bob })

            await this.master.add('100', this.lp2.address,400, true)

            await time.advanceBlockTo('1699')
            await this.master.deposit(0, 100,constants.ZERO_ADDRESS, { from: alice }) 
            await this.master.deposit(0, 100,constants.ZERO_ADDRESS, { from: bob })
            await time.advanceBlockTo('1749')
            await this.master.deposit(0, 100,constants.ZERO_ADDRESS, { from: alice })

            await time.advanceBlockTo('1799')
            await this.master.withdraw(0,196, { from: alice })
            await this.master.withdraw(0,98, { from: bob })

            assert.equal(await this.YnetToken.balanceOf(alice),'273'); 
            assert.equal(await this.YnetToken.balanceOf(bob),'196'); 
            
            assert.equal(await this.lp.balanceOf(eliah),'1006');
        }) 

        it('should allow original dev address to change devAddress', async () => {
            this.master = await YnetMasterChef.new(this.YnetToken.address, 1900, { from: owner })
            await this.YnetToken.transferOwnership(this.master.address, { from: owner })
            
            await expectRevert(
                this.master.setDevAddress(dev, { from: alice }),
                "setDevAddress: FORBIDDEN"    
            )
            await expectRevert(
                this.master.setDevAddress(constants.ZERO_ADDRESS, { from: owner }),
                "setDevAddress: cannot set dev adddres to zero address"    
            )
            await this.master.setDevAddress(dev, { from: owner })

            await this.master.add('100', this.lp.address,200, true)
            await this.lp.approve(this.master.address, '1000', { from: alice })
            await this.lp.approve(this.master.address, '1000', { from: bob })

            await this.master.add('100', this.lp2.address,400, true)

            await time.advanceBlockTo('1899')
            await this.master.deposit(0, 100,constants.ZERO_ADDRESS, { from: alice }) 
            await this.master.deposit(0, 100,constants.ZERO_ADDRESS, { from: bob })
            await time.advanceBlockTo('1949')
            await this.master.deposit(0, 100,constants.ZERO_ADDRESS, { from: alice })

            await time.advanceBlockTo('1999')
            await this.master.withdraw(0,196, { from: alice })
            await this.master.withdraw(0,98, { from: bob })

            assert.equal(await this.YnetToken.balanceOf(alice),'273'); 
            assert.equal(await this.YnetToken.balanceOf(bob),'196'); 
            assert.equal(await this.YnetToken.balanceOf(dev),'49');
        })         

        it('should properly update emmision rate', async () => {
            this.master = await YnetMasterChef.new(this.YnetToken.address, 2000, { from: owner })
            await this.YnetToken.transferOwnership(this.master.address, { from: owner })

            await this.master.add('100', this.lp.address,200, true)
            await this.master.add('100', this.lp2.address,200, true)

            await this.lp.approve(this.master.address, '1000', { from: alice })
            await this.lp.approve(this.master.address, '1000', { from: bob })

            await time.advanceBlockTo('2050')

            await this.master.updateEmissionRate({ from: owner })
            assert.equal(await this.master.ynetPerBlock(),10);

            await time.advanceBlockTo('2100')

            await this.master.updateEmissionRate({ from: owner })
            assert.equal(await this.master.ynetPerBlock(),5);

            await this.master.deposit(0, 100,constants.ZERO_ADDRESS, { from: alice }) 

            await this.master.deposit(0, 100,constants.ZERO_ADDRESS, { from: bob })   


            await time.advanceBlockTo('2200')

            await this.master.updateEmissionRate({ from: owner })
            assert.equal(await this.master.ynetPerBlock(),2);


            await this.master.withdraw(0,98, { from: alice })            
            assert.equal(await this.YnetToken.balanceOf(alice),'115');

            await time.advanceBlockTo('2300')

            await this.master.updateEmissionRate({ from: owner })
            assert.equal(await this.master.ynetPerBlock(),1);

            await this.master.withdraw(0,98, { from: bob })             
            assert.equal(await this.YnetToken.balanceOf(bob),'206');

            await time.advanceBlockTo('2400')

            await expectRevert(
                this.master.updateEmissionRate({ from: owner }),
                "updateEmissionRate: Emission rate has reached the minimum threshold"
            );

        }) 
    })
})