const { expectRevert, time } = require('@openzeppelin/test-helpers')
const YnetToken = artifacts.require('YnetToken')

contract('YnetToken', function ([alice, bob, carol, minter]) {
    beforeEach(async () => {
        this.YnetToken = await YnetToken.new({ from: alice })
        await this.YnetToken.transferOwnership(minter, { from: alice })
    })

    it('should have correct setting', async () => {
        assert.equal(await this.YnetToken.name().valueOf(), 'Ynet')
        assert.equal(await this.YnetToken.symbol().valueOf(), 'Ynet')
        assert.equal(await this.YnetToken.decimals().valueOf(), '18')
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
        await this.YnetToken.mint(alice, '500', { from: minter })
        await this.YnetToken.transfer(carol, '200', { from: alice })
        await this.YnetToken.transfer(bob, '100', { from: carol })
        const bobBal = await this.YnetToken.balanceOf(bob)
        const carolBal = await this.YnetToken.balanceOf(carol)
        assert.equal(bobBal.valueOf().toString(), '98')
        assert.equal(carolBal.valueOf().toString(), '96')
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
})