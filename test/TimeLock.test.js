const { expectRevert, time, constants,BN } = require('@openzeppelin/test-helpers')
const { web3 } = require('@openzeppelin/test-helpers/src/setup')
const YnetToken = artifacts.require('YnetToken')
const YnetMasterChef = artifacts.require('YnetMasterChef')
const MockBEP20 = artifacts.require('MockBEP20')
const Timelock = artifacts.require('Timelock')


contract('Timelock', ([alice, bob, carol, dev, eliah, minter, feeAddress, admin]) => {

    it('should have correct settings', async ()=>{
        await expectRevert( 
            Timelock.new(admin, 2160,{ from: alice }),
            "Timelock::constructor: Delay must exceed minimum delay."
        );

        await expectRevert( 
            Timelock.new(admin, 31*60*60*24,{ from: alice }),
            "Timelock::constructor: Delay must not exceed maximum delay."
        );

        this.timelock = await Timelock.new(admin, 21600,{ from: alice })

        assert.equal((await this.timelock.GRACE_PERIOD()).valueOf(), 14*24*60*60)
        assert.equal((await this.timelock.MINIMUM_DELAY()).valueOf(), 21600)
        assert.equal((await this.timelock.MAXIMUM_DELAY()).valueOf(), 30*24*60*60)
        assert.equal((await this.timelock.admin()).valueOf(), admin)
        assert.equal((await this.timelock.delay()).valueOf(), 21600)
    })

    context('With master contract deployed', () => {
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

        it('should allow to change delay',async ()=>{
            this.timelock = await Timelock.new(admin, 21600,{ from: alice })
            this.YnetToken = await YnetToken.new({from : alice})
            
            const data = web3.eth.abi.encodeParameters(['uint256'],['25000']);
            const signature = "setDelay(uint256)"
            const eta = await time.latest()/1 + 25000

            await this.timelock.queueTransaction(
                this.timelock.address, 0,signature,data,eta, {from : admin})
            
            await time.increase(40000);

            await this.timelock.executeTransaction(
                this.timelock.address, 0,signature,data,eta, {from : admin})

            assert.equal((await this.timelock.delay()).valueOf(), 25000)

        })

        it('should allow to change admin once',async ()=>{
            this.timelock = await Timelock.new(admin, 21600,{ from: alice })
            this.YnetToken = await YnetToken.new({from : alice})

            await expectRevert(
                this.timelock.setPendingAdmin(alice,{from:alice}),
                "Timelock::setPendingAdmin: First call must come from admin."
            )
            this.timelock.setPendingAdmin(alice,{from:admin});

            await expectRevert(
                this.timelock.acceptAdmin({from:bob}),
                "Timelock::acceptAdmin: Call must come from pendingAdmin."
            )
            await this.timelock.acceptAdmin({from:alice})

            await expectRevert(
                this.timelock.setPendingAdmin(alice,{from:alice}),
                "Timelock::setPendingAdmin: Call must come from Timelock."
            )

            assert.equal((await this.timelock.admin()).valueOf(), alice)

        })

        it('should allow to queue and execute txns', async ()=>{
            this.timelock = await Timelock.new(admin, 21600,{ from: alice })
            this.YnetToken = await YnetToken.new({from : alice})

            this.master = await YnetMasterChef.new(this.YnetToken.address, 100, { from: alice })
            await this.YnetToken.transferOwnership(this.master.address, { from: alice })

            await this.master.add('100', this.lp.address, 100, true, { from: alice})

            await this.master.transferOwnership(this.timelock.address,{from:alice})

            await this.lp.approve(this.master.address, '1000', { from: alice })
            await this.lp.approve(this.master.address, '1000', { from: bob })
            await this.lp2.approve(this.master.address, '1000', { from: carol })
            await this.lp2.approve(this.master.address, '1000', { from: dev })

            await time.advanceBlockTo(110);

            const data = web3.eth.abi.encodeParameters(['uint256','address','uint256','bool'],['200', this.lp2.address,400, true]);
            const signature = "add(uint256,address,uint16,bool)"
            const eta = await time.latest()/1 + 25000
            const cbt = await time.latest()/1 //current block time

            await expectRevert(
                this.timelock.queueTransaction(
                    this.master.address, 0,signature,data,eta, {from : alice}),
                "Timelock: Call must come from admin."
            ) 

            await expectRevert(
                this.timelock.queueTransaction(
                    this.master.address, 0,signature,data,cbt, {from : admin}),
                "Timelock::queueTransaction: Estimated execution block must satisfy delay."
            ) 

            await this.timelock.queueTransaction(
                this.master.address, 0,signature,data,eta, {from : admin})

            await expectRevert(
                this.timelock.executeTransaction(
                    this.master.address, 0,signature,data,eta+1, {from : admin}),
                "Timelock::executeTransaction: Transaction hasn't been queued."
            ) 
            await expectRevert(
                this.timelock.executeTransaction(
                    this.master.address, 0,signature,data,eta+1, {from : alice}),
                "Timelock: Call must come from admin."
            )
 
            await expectRevert(
                this.timelock.executeTransaction(
                    this.master.address, 0,signature,data,eta, {from : admin}),
                "Timelock::executeTransaction: Transaction hasn't surpassed time lock."
            )   

            await time.increase(10*60*60)

            await this.timelock.executeTransaction(
                this.master.address, 0,signature,data,eta, {from : admin})

            const  callData2 = web3.utils.keccak256("set(uint256,uint256,uint16,bool)").substr(0,10)
            .concat(web3.eth.abi.encodeParameters(['uint256','uint256','uint16','bool'],[0,200,300,true]).substr(2));
            const eta2 = await time.latest()/1 + 25000
                
            await this.timelock.queueTransaction(
                this.master.address, 0,"",callData2,eta2, {from : admin})

            await time.increase(25000)

            await this.timelock.executeTransaction(
                this.master.address, 0,"",callData2,eta2, {from : admin})


            assert.equal((await this.master.poolInfo(0)).lpToken.valueOf(), this.lp.address)
            assert.equal((await this.master.poolInfo(0)).allocPoint.valueOf(), '200')
            assert.equal((await this.master.poolInfo(0)).depositFeeBP.valueOf(), '300')
            assert.equal((await this.master.poolInfo(1)).lpToken.valueOf(), this.lp2.address)
            assert.equal((await this.master.poolInfo(1)).allocPoint.valueOf(), '200')
            assert.equal((await this.master.poolInfo(1)).depositFeeBP.valueOf(), '400')
        }) 

        it('should allow cancel txns', async ()=>{
            this.timelock = await Timelock.new(admin, 21600,{ from: alice })
            this.YnetToken = await YnetToken.new({from : alice})
            this.master = await YnetMasterChef.new(this.YnetToken.address, 150, { from: alice })
            await this.YnetToken.transferOwnership(this.master.address, { from: alice })

            await this.master.add('100', this.lp.address,150, true, { from: alice})
            await this.master.add('100', this.lp2.address,200, true, { from: alice})

            await this.master.transferOwnership(this.timelock.address,{from:alice})

            await this.lp.approve(this.master.address, '1000', { from: alice })
            await this.lp.approve(this.master.address, '1000', { from: bob })
            await this.lp2.approve(this.master.address, '1000', { from: carol })
            await this.lp2.approve(this.master.address, '1000', { from: dev })

            await time.advanceBlockTo(170);

            const data = web3.eth.abi.encodeParameters(['uint256','uint256','uint16','bool'],[0,200,0,true]);
            const signature = "set(uint256,uint256,uint16,bool)"
            const eta = await time.latest()/1 + 25000

            await this.timelock.queueTransaction(
                this.master.address, 0,signature,data,eta, {from : admin})
            
            await time.increase(1*60*60);

            await expectRevert(
                this.timelock.cancelTransaction(
                    this.master.address, 0,signature,data,eta, {from : alice}),
                "Timelock: Call must come from admin."
            )
 
            await this.timelock.cancelTransaction(
                this.master.address, 0,signature,data,eta, {from : admin})

            await expectRevert(
                this.timelock.executeTransaction(
                    this.master.address, 0,signature,data,eta, {from : admin}),
                "Timelock::executeTransaction: Transaction hasn't been queued."
            ) 

            assert.equal((await this.master.poolInfo(0)).lpToken.valueOf(), this.lp.address)
            assert.equal((await this.master.poolInfo(0)).allocPoint.valueOf(), '100')
            assert.equal((await this.master.poolInfo(0)).depositFeeBP.valueOf(), '150')
        }) 
    })
})