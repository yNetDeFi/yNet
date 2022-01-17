const { expectRevert, time, constants } = require('@openzeppelin/test-helpers')
const YnetToken = artifacts.require('YnetToken')

contract('YnetToken', function ([alice, bob, carol, minter]) {
    beforeEach(async () => {
        this.YnetToken = await YnetToken.new({ from: alice })
        await this.YnetToken.transferOwnership(minter, { from: alice })
    })

    it('should have correct setting', async () => {
        assert.equal(await this.YnetToken.name().valueOf(), 'yNet')
        assert.equal(await this.YnetToken.symbol().valueOf(), 'yNet')
        assert.equal(await this.YnetToken.decimals().valueOf(), '18')
        assert.equal(await this.YnetToken.transferTaxRate().valueOf(), '750')
        assert.equal(await this.YnetToken.MAXIMUM_TRANSFER_TAX_RATE().valueOf(), '1000')
        assert.equal(await this.YnetToken.BURN_ADDRESS().valueOf(), '0x000000000000000000000000000000000000dEaD')
        assert.equal(await this.YnetToken.operator().valueOf(), alice)
    })
    
    it('should allow only owner to transfer Ownership', async () => {
        await expectRevert(
            this.YnetToken.transferOwnership(bob, { from: alice }),
            'Ownable: caller is not the owner'
        )
        await this.YnetToken.transferOwnership(bob, { from: minter })
        assert.equal((await this.YnetToken.owner()).valueOf(), bob)
    })

    it('should only allow master to mint token', async () => {
        await this.YnetToken.mint(alice, '100', { from: minter })
        await this.YnetToken.mint(bob, '1000', { from: minter })
        await expectRevert(
            this.YnetToken.mint(carol, '1000', { from: bob }),
            'Ownable: caller is not the owner',
        )
        const totalSupply = await this.YnetToken.totalSupply()
        const aliceBal = await this.YnetToken.balanceOf(alice)
        const bobBal = await this.YnetToken.balanceOf(bob)
        const carolBal = await this.YnetToken.balanceOf(carol)
        assert.equal(totalSupply.valueOf(), 1100)
        assert.equal(aliceBal.valueOf(), '100')
        assert.equal(bobBal.valueOf(), '1000')
        assert.equal(carolBal.valueOf(), '0')
    })

    it('should supply token transfers properly', async () => {
        await this.YnetToken.mint(alice, '5000', { from: minter })
        await this.YnetToken.transfer(carol, '2000', { from: alice })
        await this.YnetToken.transfer(bob, '1000', { from: carol })
        await this.YnetToken.transfer('0x000000000000000000000000000000000000dEaD', '1000', { from: alice })
        const bobBal = await this.YnetToken.balanceOf(bob)
        const carolBal = await this.YnetToken.balanceOf(carol)
        const burnBal = await this.YnetToken.balanceOf('0x000000000000000000000000000000000000dEaD')

        assert.equal(bobBal.valueOf().toString(), '925')
        assert.equal(carolBal.valueOf().toString(), '850')
        assert.equal(burnBal.valueOf().toString(), '1225')

    })

    it('should fail if you try to do bad transfers', async () => {
        await this.YnetToken.mint(alice, '500', { from: minter })
        await this.YnetToken.transfer(carol, '10', { from: alice })
        await expectRevert(
            this.YnetToken.transfer(bob, '110', { from: carol }),
            'BEP20: transfer amount exceeds balance',
        )
        await expectRevert(
            this.YnetToken.transfer(carol, '1', { from: bob }),
            'BEP20: transfer amount exceeds balance',
        )
    })

    it('should peoperly update transfer tax rate', async () => {
        await expectRevert(
            this.YnetToken.updateTransferTaxRate('1500', { from: alice }),
            'YNET::updateTransferTaxRate: Transfer tax rate must not exceed the maximum rate.',
        )
        await expectRevert(
            this.YnetToken.updateTransferTaxRate('100', { from: carol }),
            'operator: caller is not the operator',
        )
        await this.YnetToken.updateTransferTaxRate('900', { from: alice })
        assert.equal(await this.YnetToken.transferTaxRate().valueOf(), '900')

    })

    it('should allow current operator to set new operator', async () => {
        await expectRevert(
            this.YnetToken.transferOperator(constants.ZERO_ADDRESS, { from: alice }),
            'YNET::transferOperator: new operator is the zero address',
        )
        await expectRevert(
            this.YnetToken.transferOperator(bob, { from: carol }),
            'operator: caller is not the operator',
        )
        await this.YnetToken.transferOperator(bob, { from: alice })
        assert.equal(await this.YnetToken.operator().valueOf(), bob)

    })
})