var sha256 = require('js-sha256').sha256

// var MultiPaymentChannelHashlocks = artifacts.require("MasterchainMultiPaymentChannelHashlocks")
var MultiPaymentChannelHashlocks = artifacts.require("MultiPaymentChannelHashlocks")

const CUSTOMER = 1
const MERCHANT = 2

function b32 (s) {
    s = s.toLowerCase()
    if (s.substr(0,2) == '0x') {
        s = s.substr(2)
    }
    var zs = []
    for (var i=0; i<64-s.length; i++) { zs.push(0) }
    return '0x' + zs.join('') + s
}

async function assertChannelState (cp, type, params) {
    var channel = await mpch.channels(cp, type)
    if (params.exists) assert.equal(channel[0].toNumber() > 0, true, 'exists')
    if (params.deleted || params.notExists) assert.equal(channel[0].toNumber(), 0, 'deleted OR not exists')

    if (params.created) assert.equal(channel[0].toNumber(), params.created, 'created')
    if (params.deposited) assert.equal(channel[1].toNumber(), params.deposited, 'deposited')
    if (params.spent) assert.equal(channel[2].toNumber(), params.spent, 'spent')
    if (params.sn) assert.equal(channel[3].toNumber(), params.sn, 'sn')
    if (params.lastUpdate) assert.equal(channel[4].toNumber(), params.lastUpdate, 'lastUpdate')
}

function vrs (account, message) {
    var signature = web3.eth.sign(account, message)
    return {
        v: parseInt(signature.substring(66+64)) + 27,
        r: '0x' + signature.substring(2, 66),
        s: '0x' + signature.substring(66, 66+64),
    }
}

// https://github.com/OpenZeppelin/zeppelin-solidity/blob/master/test/helpers/expectThrow.js
let expectThrow = async promise => {
  try {
    await promise;
  } catch (error) {
    // TODO: Check jump destination to destinguish between a throw
    //       and an actual invalid jump.
    const invalidOpcode = error.message.search('invalid opcode') >= 0;
    // TODO: When we contract A calls contract B, and B throws, instead
    //       of an 'invalid jump', we get an 'out of gas' error. How do
    //       we distinguish this from an actual out of gas event? (The
    //       ganache log actually show an 'invalid jump' event.)
    const outOfGas = error.message.search('out of gas') >= 0;
    const revert = error.message.search('revert') >= 0;
    assert(
      invalidOpcode || outOfGas || revert,
      'Expected throw, got \'' + error + '\' instead',
    );
    return;
  }
  assert.fail('Expected throw not received');
};

function timeTravel (x) {
    return new Promise( (resolve, reject) => {
        web3.currentProvider.sendAsync({
          jsonrpc: '2.0',
          method: 'evm_increaseTime',
          params: [ x ],
          id: new Date().getSeconds()
        }, (err, resp) => {
          if (!err) {
            web3.currentProvider.sendAsync({
                jsonrpc: '2.0',
                method: 'evm_mine',
                params: [],
                id: new Date().getSeconds()
              }, (e, r) => {
                if (e) reject(e);
                resolve(r);
              })
            }
        })
    })
}

contract('MultiPaymentChannelHashlocks', (accounts) => {

    describe('Assigining variables', function () {
        it('have everything in place', async () => {
            mpch = await MultiPaymentChannelHashlocks.deployed()
            processing = accounts[0]
            customer1 = accounts[1]
            customer2 = accounts[2]
            merchant1 = accounts[5]
            merchant2 = accounts[6]
        })
    })

    describe('Customer', function () {

        it('can open channel', async () => {
            await mpch.newCustomer({ from: customer1, value: 1e18 })
            await assertChannelState(customer1, CUSTOMER, {
                deposited: 1e18,
                spent: 0,
                sn: 0,
            })
            await assertChannelState(customer2, CUSTOMER, { notExists: true })
            await assertChannelState(customer1, MERCHANT, { notExists: true })
        })

        it('can not open second channel for this account', async () => {
            await expectThrow(mpch.newCustomer({ from: customer1, value: 1e18 }))
        })

        it('can open another channel for another account', async () => {
            await mpch.newCustomer({ from: customer2, value: 2e18 })
            await assertChannelState(customer2, CUSTOMER, {
                deposited: 2e18,
                spent: 0,
                sn: 0,
            })
        })


        it('can post update tx', async () => {
            var sn = 1
            var shift = 100500
            var hashlockPlain = b32('abba')
            var hashlock = await mpch.hashSHA256(hashlockPlain, { encoding: 'hex' })
            var msg = (await mpch.customerUTHashlock(customer1, sn, shift, false, hashlock, { encoding: 'hex' }))
            var customerSig = vrs(customer1, msg)
            var ownerSig = vrs(processing, msg)
            await mpch.publishCustomerUTHashlock(
                customer1,
                sn, shift,
                customerSig.v, customerSig.r, customerSig.s,
                ownerSig.v, ownerSig.r, ownerSig.s,
                false, hashlockPlain
            )
            await assertChannelState(customer1, CUSTOMER, {
                deposited: 1e18,
                spent: shift,
                sn: sn,
            })
        })

        it('can post another update tx', async () => {
            var sn = 10
            var shift = 200300
            var hashlockPlain = b32('239048209384')
            var hashlock = await mpch.hashSHA256(hashlockPlain, { encoding: 'hex' })
            var msg = (await mpch.customerUTHashlock(customer1, sn, shift, false, hashlock))
            var customerSig = vrs(customer1, msg)
            var ownerSig = vrs(processing, msg)
            await mpch.publishCustomerUTHashlock(
                customer1,
                sn, shift,
                customerSig.v, customerSig.r, customerSig.s,
                ownerSig.v, ownerSig.r, ownerSig.s, false,
                hashlockPlain
            )
            await assertChannelState(customer1, CUSTOMER, {
                deposited: 1e18,
                spent: shift,
                sn: sn,
            })
            reusingSig = [customerSig, ownerSig, hashlockPlain, hashlock]
        })

        it ('can not post same UT again', async () => {
            var sn = 10
            var shift = 200300
            var msg = (await mpch.customerUTHashlock(customer1, sn, shift, false, reusingSig[3]))
            // var customerSig = vrs(customer1, msg)
            // var ownerSig = vrs(processing, msg)
            await expectThrow(mpch.publishCustomerUTHashlock(
                customer1,
                sn, shift,
                reusingSig[0].v, reusingSig[0].r, reusingSig[0].s,
                reusingSig[1].v, reusingSig[1].r, reusingSig[1].s,
                false, reusingSig[2]
            ))
        })

        it ('can not post UT signed by another customer', async () => {
            var sn = 15
            var shift = 666
            var hashlockPlain = b32('abcdef')
            var hashlock = await mpch.hashSHA256(hashlockPlain, { encoding: 'hex' })
            var msg = (await mpch.customerUTHashlock(customer1, sn, shift, false, hashlock))
            var customerSig = vrs(customer1, msg)
            var ownerSig = vrs(processing, msg)
            await expectThrow(mpch.publishCustomerUTHashlock(
                customer2,
                sn, shift,
                customerSig.v, customerSig.r, customerSig.s,
                ownerSig.v, ownerSig.r, ownerSig.s,
                false, hashlockPlain
            ))
        })

        it ('can not post UT if customer signature is incorrect', async () => {
            var sn = 15
            var shift = 666
            var hashlockPlain = b32('23874')
            var hashlock = await mpch.hashSHA256(hashlockPlain, { encoding: 'hex' })
            var msg = (await mpch.customerUTHashlock(customer1, sn, shift, false, hashlock))
            var customerSig = vrs(customer1, msg)
            var ownerSig = vrs(processing, msg)
            await expectThrow(mpch.publishCustomerUTHashlock(
                customer1,
                sn, shift,
                customerSig.v, customerSig.s, customerSig.r, // incorrectness: `s` and `r` components are swapped
                ownerSig.v, ownerSig.r, ownerSig.s,
                false, hashlockPlain
            ))
        })

        it ('can not post UT if owner signature is incorrect', async () => {
            var sn = 15
            var shift = 666
            var hashlockPlain = b32('32904788923')
            var hashlock = await mpch.hashSHA256(hashlockPlain, { encoding: 'hex' })
            var msg = (await mpch.customerUTHashlock(customer1, sn, shift, false, hashlock))
            var customerSig = vrs(customer1, msg)
            var ownerSig = vrs(processing, msg)
            await expectThrow(mpch.publishCustomerUTHashlock(
                customer1,
                sn, shift,
                customerSig.v, customerSig.r, customerSig.s,
                ownerSig.v, ownerSig.s, ownerSig.r,  // incorrectness: `s` and `r` components are swapped
                false, hashlockPlain
            ))
        })

        it ('can not post an UT with sequence number less that previous one', async () => {
            var sn = (await mpch.channels(customer1, CUSTOMER))[3].toNumber() - 1
            var shift = 666
            var hashlockPlain = b32('23873244')
            var hashlock = await mpch.hashSHA256(hashlockPlain, { encoding: 'hex' })
            var msg = (await mpch.customerUTHashlock(customer1, sn, shift, false, hashlock))
            var customerSig = vrs(customer1, msg)
            var ownerSig = vrs(processing, msg)
            await expectThrow(mpch.publishCustomerUTHashlock(
                customer1,
                sn, shift,
                customerSig.v, customerSig.r, customerSig.s,
                ownerSig.v, ownerSig.r, ownerSig.s,
                false, hashlockPlain
            ))
        })

        it ('can not post an UT with balance shift greater than channel balance', async () => {
            var sn = (await mpch.channels(customer1, CUSTOMER))[3].toNumber() + 1
            var shift = (await mpch.channels(customer1, CUSTOMER))[1].toNumber() * 2
            var hashlockPlain = b32('2039482934')
            var hashlock = await mpch.hashSHA256(hashlockPlain, { encoding: 'hex' })
            var msg = (await mpch.customerUTHashlock(customer1, sn, shift, false, hashlock))
            var customerSig = vrs(customer1, msg)
            var ownerSig = vrs(processing, msg)
            await expectThrow(mpch.publishCustomerUTHashlock(
                customer1,
                sn, shift,
                customerSig.v, customerSig.r, customerSig.s,
                ownerSig.v, ownerSig.r, ownerSig.s,
                false, hashlockPlain
            ))
        })


        it ('customer can not close channel before hold time', async () => {
            await expectThrow(mpch.closeCustomerChannel(customer1))
        })

        it ('processing can not close channel before hold time', async () => {
            await expectThrow(mpch.closeCustomerChannel(customer1))
        })

        it('processing can close channnel after hold time', async () => {
            await timeTravel(24 * 60 * 60)
            await mpch.closeCustomerChannel(customer1)
            await assertChannelState(customer1, CUSTOMER, {
                deleted: true
            })
        })

        it('cusomer can close channnel after hold time', async () => {
            await timeTravel(24 * 60 * 60)
            await mpch.closeCustomerChannel(customer2)
            await assertChannelState(customer2, CUSTOMER, {
                deleted: true
            })
        })

        it ('can not post UT to closed channel', async () => {
            var sn = (await mpch.channels(customer1, CUSTOMER))[3].toNumber() + 1
            var shift = 100
            var hashlockPlain = b32('231111874')
            var hashlock = await mpch.hashSHA256(hashlockPlain, { encoding: 'hex' })
            var msg = (await mpch.customerUTHashlock(customer1, sn, shift, false, hashlock))
            var customerSig = vrs(customer1, msg)
            var ownerSig = vrs(processing, msg)
            await expectThrow(mpch.publishCustomerUTHashlock(
                customer1,
                sn, shift,
                customerSig.v, customerSig.r, customerSig.s,
                ownerSig.v, ownerSig.r, ownerSig.s,
                false, hashlockPlain
            ))
        })


        it('can open channel again', async () => {
            await mpch.newCustomer({ from: customer1, value: 1e18 })
            await assertChannelState(customer1, CUSTOMER, {
                deposited: 1e18,
                spent: 0,
                sn: 0,
            })
        })

        it ('can not post UT from previous channel (reuse)', async () => {
            var sn = 10
            var shift = 200300
            var hashlockPlain = b32('989898')
            var hashlock = await mpch.hashSHA256(hashlockPlain, { encoding: 'hex' })
            var msg = (await mpch.customerUTHashlock(customer1, sn, shift, false, hashlock))
            // var customerSig = vrs(customer1, msg)
            // var ownerSig = vrs(processing, msg)
            await expectThrow(mpch.publishCustomerUTHashlock(
                customer1,
                sn, shift,
                reusingSig[0].v, reusingSig[0].r, reusingSig[0].s,
                reusingSig[1].v, reusingSig[1].r, reusingSig[1].s,
                false, hashlockPlain
            ))
        })

        it('can post update tx with immediate close', async () => {
            var sn = 1
            var shift = 100500
            var hashlockPlain = b32('3498767345')
            var hashlock = await mpch.hashSHA256(hashlockPlain, { encoding: 'hex' })
            var msg = (await mpch.customerUTHashlock(customer1, sn, shift, true, hashlock))
            var customerSig = vrs(customer1, msg)
            var ownerSig = vrs(processing, msg)
            await mpch.publishCustomerUTHashlock(
                customer1,
                sn, shift,
                customerSig.v, customerSig.r, customerSig.s,
                ownerSig.v, ownerSig.r, ownerSig.s,
                true, hashlockPlain
            )
            await assertChannelState(customer1, CUSTOMER, {
                deleted: true,
            })
        })

    })

    describe('Merchant', function () {

        it('can open channel', async () => {
            await mpch.newCustomer({ from: customer1, value: 4e18 })
            await mpch.newMerchant(merchant1, 1e18, { from: processing })
            await assertChannelState(merchant1, MERCHANT, {
                deposited: 1e18,
                spent: 0,
                sn: 0,
            })
            await assertChannelState(merchant2, MERCHANT, { notExists: true })
            await assertChannelState(merchant1, CUSTOMER, { notExists: true })
        })

        it('can not open second channel for this account', async () => {
            await expectThrow(mpch.newMerchant(merchant1, 1e18, { from: processing }))
        })

        it('can open another channel for another account', async () => {
            await mpch.newMerchant(merchant2, 2e18, { from: processing })
            await assertChannelState(merchant2, MERCHANT, {
                deposited: 2e18,
                spent: 0,
                sn: 0,
            })
        })


        it('can post update tx', async () => {
            var sn = 1
            var shift = 100500
            var hashlockPlain = b32('23874')
            var hashlock = await mpch.hashSHA256(hashlockPlain, { encoding: 'hex' })
            var msg = (await mpch.merchantUTHashlock(merchant1, sn, shift, false, hashlock))
            var merchantSig = vrs(merchant1, msg)
            var ownerSig = vrs(processing, msg)
            await mpch.publishMerchantUTHashlock(
                merchant1,
                sn, shift,
                merchantSig.v, merchantSig.r, merchantSig.s,
                ownerSig.v, ownerSig.r, ownerSig.s,
                false, hashlockPlain
            )
            await assertChannelState(merchant1, MERCHANT, {
                deposited: 1e18,
                spent: shift,
                sn: sn,
            })
        })

        it('can post another update tx', async () => {
            var sn = 10
            var shift = 200300
            var hashlockPlain = b32('23874')
            var hashlock = await mpch.hashSHA256(hashlockPlain, { encoding: 'hex' })
            var msg = (await mpch.merchantUTHashlock(merchant1, sn, shift, false, hashlock))
            var merchantSig = vrs(merchant1, msg)
            var ownerSig = vrs(processing, msg)
            await mpch.publishMerchantUTHashlock(
                merchant1,
                sn, shift,
                merchantSig.v, merchantSig.r, merchantSig.s,
                ownerSig.v, ownerSig.r, ownerSig.s,
                false, hashlockPlain
            )
            await assertChannelState(merchant1, MERCHANT, {
                deposited: 1e18,
                spent: shift,
                sn: sn,
            })
            reusingSig = [merchantSig, ownerSig]
        })

        it ('can not post same UT again', async () => {
            var sn = 10
            var shift = 200300
            var hashlockPlain = b32('23874')
            var hashlock = await mpch.hashSHA256(hashlockPlain, { encoding: 'hex' })
            var msg = (await mpch.merchantUTHashlock(merchant1, sn, shift, false, hashlock))
            // var merchantSig = vrs(merchant1, msg)
            // var ownerSig = vrs(processing, msg)
            await expectThrow(mpch.publishMerchantUTHashlock(
                merchant1,
                sn, shift,
                reusingSig[0].v, reusingSig[0].r, reusingSig[0].s,
                reusingSig[1].v, reusingSig[1].r, reusingSig[1].s,
                false, hashlockPlain
            ))
        })

        it ('can not post UT signed by another merchant', async () => {
            var sn = 15
            var shift = 666
            var hashlockPlain = b32('23213874')
            var hashlock = await mpch.hashSHA256(hashlockPlain, { encoding: 'hex' })
            var msg = (await mpch.merchantUTHashlock(merchant1, sn, shift, false, hashlock))
            var merchantSig = vrs(merchant1, msg)
            var ownerSig = vrs(processing, msg)
            await expectThrow(mpch.publishMerchantUTHashlock(
                merchant2,
                sn, shift,
                merchantSig.v, merchantSig.r, merchantSig.s,
                ownerSig.v, ownerSig.r, ownerSig.s,
                false, hashlockPlain
            ))
        })

        it ('can not post UT if merchant signature is incorrect', async () => {
            var sn = 15
            var shift = 666
            var hashlockPlain = b32('238aaba74')
            var hashlock = await mpch.hashSHA256(hashlockPlain, { encoding: 'hex' })
            var msg = (await mpch.merchantUTHashlock(merchant1, sn, shift, false, hashlock))
            var merchantSig = vrs(merchant1, msg)
            var ownerSig = vrs(processing, msg)
            await expectThrow(mpch.publishMerchantUTHashlock(
                merchant1,
                sn, shift,
                merchantSig.v, merchantSig.s, merchantSig.r, // incorrectness: `s` and `r` components are swapped
                ownerSig.v, ownerSig.r, ownerSig.s,
                false, hashlockPlain
            ))
        })

        it ('can not post UT if owner signature is incorrect', async () => {
            var sn = 15
            var shift = 666
            var hashlockPlain = b32('a2a3a874')
            var hashlock = await mpch.hashSHA256(hashlockPlain, { encoding: 'hex' })
            var msg = (await mpch.merchantUTHashlock(merchant1, sn, shift, false, hashlock))
            var merchantSig = vrs(merchant1, msg)
            var ownerSig = vrs(processing, msg)
            await expectThrow(mpch.publishMerchantUTHashlock(
                merchant1,
                sn, shift,
                merchantSig.v, merchantSig.r, merchantSig.s,
                ownerSig.v, ownerSig.s, ownerSig.r,  // incorrectness: `s` and `r` components are swapped
                false, hashlockPlain
            ))
        })

        it ('can not post an UT with sequence number less that previous one', async () => {
            var sn = (await mpch.channels(merchant1, MERCHANT))[3].toNumber() - 1
            var shift = 666
            var hashlockPlain = b32('23874')
            var hashlock = await mpch.hashSHA256(hashlockPlain, { encoding: 'hex' })
            var msg = (await mpch.merchantUTHashlock(merchant1, sn, shift, false, hashlock))
            var merchantSig = vrs(merchant1, msg)
            var ownerSig = vrs(processing, msg)
            await expectThrow(mpch.publishMerchantUTHashlock(
                merchant1,
                sn, shift,
                merchantSig.v, merchantSig.r, merchantSig.s,
                ownerSig.v, ownerSig.r, ownerSig.s,
                false, hashlockPlain
            ))
        })

        it ('can not post an UT with balance shift greater than channel balance', async () => {
            var sn = (await mpch.channels(merchant1, MERCHANT))[3].toNumber() + 1
            var shift = (await mpch.channels(merchant1, MERCHANT))[1].toNumber() * 2
            var hashlockPlain = b32('23874')
            var hashlock = await mpch.hashSHA256(hashlockPlain, { encoding: 'hex' })
            var msg = (await mpch.merchantUTHashlock(merchant1, sn, shift, false, hashlock))
            var merchantSig = vrs(merchant1, msg)
            var ownerSig = vrs(processing, msg)
            await expectThrow(mpch.publishMerchantUTHashlock(
                merchant1,
                sn, shift,
                merchantSig.v, merchantSig.r, merchantSig.s,
                ownerSig.v, ownerSig.r, ownerSig.s,
                false, hashlockPlain
            ))
        })


        it ('merchant can not close channel before hold time', async () => {
            await expectThrow(mpch.closeMerchantChannel(merchant1))
        })

        it ('processing can not close channel before hold time', async () => {
            await expectThrow(mpch.closeMerchantChannel(merchant1))
        })

        it('processing can close channnel after hold time', async () => {
            await timeTravel(24 * 60 * 60)
            await mpch.closeMerchantChannel(merchant1)
            await assertChannelState(merchant1, MERCHANT, {
                deleted: true
            })
        })

        it('merchant can close channnel after hold time', async () => {
            await timeTravel(24 * 60 * 60)
            await mpch.closeMerchantChannel(merchant2)
            await assertChannelState(merchant2, MERCHANT, {
                deleted: true
            })
        })

        it ('can not post UT to closed channel', async () => {
            var sn = (await mpch.channels(merchant1, MERCHANT))[3].toNumber() + 1
            var shift = 100
            var hashlockPlain = b32('2a3b8c7d4')
            var hashlock = await mpch.hashSHA256(hashlockPlain, { encoding: 'hex' })
            var msg = (await mpch.merchantUTHashlock(merchant1, sn, shift, false, hashlock))
            var merchantSig = vrs(merchant1, msg)
            var ownerSig = vrs(processing, msg)
            await expectThrow(mpch.publishMerchantUTHashlock(
                merchant1,
                sn, shift,
                merchantSig.v, merchantSig.r, merchantSig.s,
                ownerSig.v, ownerSig.r, ownerSig.s,
                false, hashlockPlain
            ))
        })


        it('can open channel again', async () => {
            await mpch.newMerchant(merchant1, 1e16, { from: processing })
            await assertChannelState(merchant1, MERCHANT, {
                deposited: 1e16,
                spent: 0,
                sn: 0,
            })
        })

        it ('can not post UT from previous channel (reuse)', async () => {
            var sn = 10
            var shift = 200300
            var hashlockPlain = b32('23874')
            var hashlock = await mpch.hashSHA256(hashlockPlain, { encoding: 'hex' })
            var msg = (await mpch.merchantUTHashlock(merchant1, sn, shift, false, hashlock))
            await expectThrow(mpch.publishMerchantUTHashlock(
                merchant1,
                sn, shift,
                reusingSig[0].v, reusingSig[0].r, reusingSig[0].s,
                reusingSig[1].v, reusingSig[1].r, reusingSig[1].s,
                false, hashlockPlain
            ))
        })

        it('can post update tx with immediate close', async () => {
            var sn = 1
            var shift = 100500
            var hashlockPlain = b32('3498767345')
            var hashlock = await mpch.hashSHA256(hashlockPlain, { encoding: 'hex' })
            var msg = (await mpch.merchantUTHashlock(merchant1, sn, shift, true, hashlock))
            var merchantSig = vrs(merchant1, msg)
            var ownerSig = vrs(processing, msg)
            await mpch.publishMerchantUTHashlock(
                merchant1,
                sn, shift,
                merchantSig.v, merchantSig.r, merchantSig.s,
                ownerSig.v, ownerSig.r, ownerSig.s,
                true, hashlockPlain
            )
            await assertChannelState(merchant1, MERCHANT, {
                deleted: true,
            })
        })
    })
})