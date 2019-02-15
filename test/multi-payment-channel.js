var MultiPaymentChannel = artifacts.require("MultiPaymentChannel")
// var MultiPaymentChannel = artifacts.require("MasterchainMultiPaymentChannel")

const CUSTOMER = 1
const MERCHANT = 2

async function assertChannelState (cp, type, params) {
    var channel = await mpc.channels(cp, type)
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

contract('MultiPaymentChannel', (accounts) => {

    describe('Assigining variables', function () {
        it('have everything in place', async () => {
            mpc = await MultiPaymentChannel.deployed()
            processing = accounts[0]
            customer1 = accounts[1]
            customer2 = accounts[2]
            merchant1 = accounts[5]
            merchant2 = accounts[6]
        })
    })

    describe('Processing can manage own funds', function () {
        it('can deposit', async () => {
            var depositAmount = 1e16
            await mpc.processingDeposit({ from: processing, value: depositAmount })
            var depositedAmount = (await mpc.totalProcessingFunds()).toNumber()
            assert.equal(depositAmount, depositedAmount)
        })

        it('cannot withdraw more than deposited', async () => {
            var withdrawAmount = 1e20
            var depositAmount = 1e16
            var depositedAmountBefore = (await mpc.totalProcessingFunds()).toNumber()
            await expectThrow(mpc.processingWithdraw(withdrawAmount))
            var depositedAmountAfter = (await mpc.totalProcessingFunds()).toNumber()
            assert.equal(depositedAmountBefore, depositedAmountAfter)
        })

        it('cannot deposit if not an owner', async () => {
            var depositAmount = 1e16
            var depositedAmountBefore = (await mpc.totalProcessingFunds()).toNumber()
            await expectThrow(mpc.processingDeposit({ from: merchant2, value: depositAmount }))
            var depositedAmountAfter = (await mpc.totalProcessingFunds()).toNumber()
            assert.equal(depositedAmountBefore, depositedAmountAfter)
        })

        it('cannot withdraw if not an owner', async () => {
            var withdrawAmount = 1e10
            var depositedAmountBefore = (await mpc.totalProcessingFunds()).toNumber()
            await expectThrow(mpc.processingWithdraw(withdrawAmount, { from: merchant2 }))
            var depositedAmountAfter = (await mpc.totalProcessingFunds()).toNumber()
            assert.equal(depositedAmountBefore, depositedAmountAfter)
        })

        it('can do partial withdraw', async () => {
            var withdrawAmount = 1e15
            var processingBalanceBefore = (await web3.eth.getBalance(processing)).toNumber()
            var depositedAmountBefore = (await mpc.totalProcessingFunds()).toNumber()
            await mpc.processingWithdraw(withdrawAmount, { from: processing })
            var depositedAmountAfter = (await mpc.totalProcessingFunds()).toNumber()
            var processingBalanceAfter = (await web3.eth.getBalance(processing)).toNumber()
            assert.equal(depositedAmountBefore, depositedAmountAfter + withdrawAmount)
            // assert.equal(processingBalanceBefore + withdrawAmount, processingBalanceAfter) // will fail because of tx commission
        })

        it('can withdraw everything', async () => {
            var withdrawAmount = (await mpc.totalProcessingFunds()).toNumber()
            var processingBalanceBefore = (await web3.eth.getBalance(processing)).toNumber()
            var depositedAmountBefore = (await mpc.totalProcessingFunds()).toNumber()
            await mpc.processingWithdraw(withdrawAmount, { from: processing })
            var depositedAmountAfter = (await mpc.totalProcessingFunds()).toNumber()
            var processingBalanceAfter = (await web3.eth.getBalance(processing)).toNumber()
            assert.equal(0, depositedAmountAfter)
            assert.equal(depositedAmountBefore, depositedAmountAfter + withdrawAmount)
            // assert.equal(processingBalanceBefore + withdrawAmount, processingBalanceAfter) // will fail because of tx commission
        })


    })

    describe('Customer', function () {

        it('can open channel', async () => {
            await mpc.newCustomer({ from: customer1, value: 1e18 })
            await assertChannelState(customer1, CUSTOMER, {
                deposited: 1e18,
                spent: 0,
                sn: 0,
            })
            await assertChannelState(customer2, CUSTOMER, { notExists: true })
            await assertChannelState(customer1, MERCHANT, { notExists: true })
        })

        it('can not open second channel for this account', async () => {
            await expectThrow(mpc.newCustomer({ from: customer1, value: 1e18 }))
        })

        it('can open another channel for another account', async () => {
            await mpc.newCustomer({ from: customer2, value: 2e18 })
            await assertChannelState(customer2, CUSTOMER, {
                deposited: 2e18,
                spent: 0,
                sn: 0,
            })
        })


        it('can post update tx', async () => {
            var sn = 1
            var shift = 100500
            var msg = (await mpc.customerUT(customer1, sn, shift, false))
            var customerSig = vrs(customer1, msg)
            var ownerSig = vrs(processing, msg)
            await mpc.publishCustomerUT(
                customer1,
                sn, shift,
                customerSig.v, customerSig.r, customerSig.s,
                ownerSig.v, ownerSig.r, ownerSig.s,
                false
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
            var msg = (await mpc.customerUT(customer1, sn, shift, false))
            var customerSig = vrs(customer1, msg)
            var ownerSig = vrs(processing, msg)
            await mpc.publishCustomerUT(
                customer1,
                sn, shift,
                customerSig.v, customerSig.r, customerSig.s,
                ownerSig.v, ownerSig.r, ownerSig.s,
                false
            )
            await assertChannelState(customer1, CUSTOMER, {
                deposited: 1e18,
                spent: shift,
                sn: sn,
            })
            reusingSig = [customerSig, ownerSig]
        })

        it ('can not post same UT again', async () => {
            var sn = 10
            var shift = 200300
            var msg = (await mpc.customerUT(customer1, sn, shift, false))
            // var customerSig = vrs(customer1, msg)
            // var ownerSig = vrs(processing, msg)
            await expectThrow(mpc.publishCustomerUT(
                customer1,
                sn, shift,
                reusingSig[0].v, reusingSig[0].r, reusingSig[0].s,
                reusingSig[1].v, reusingSig[1].r, reusingSig[1].s,
                false
            ))
        })

        it ('can not post UT signed by another customer', async () => {
            var sn = 15
            var shift = 666
            var msg = (await mpc.customerUT(customer1, sn, shift, false))
            var customerSig = vrs(customer1, msg)
            var ownerSig = vrs(processing, msg)
            await expectThrow(mpc.publishCustomerUT(
                customer2,
                sn, shift,
                customerSig.v, customerSig.r, customerSig.s,
                ownerSig.v, ownerSig.r, ownerSig.s,
                false
            ))
        })

        it ('can not post UT if customer signature is incorrect', async () => {
            var sn = 15
            var shift = 666
            var msg = (await mpc.customerUT(customer1, sn, shift, false))
            var customerSig = vrs(customer1, msg)
            var ownerSig = vrs(processing, msg)
            await expectThrow(mpc.publishCustomerUT(
                customer1,
                sn, shift,
                customerSig.v, customerSig.s, customerSig.r, // incorrectness: `s` and `r` components are swapped
                ownerSig.v, ownerSig.r, ownerSig.s,
                false
            ))
        })

        it ('can not post UT if owner signature is incorrect', async () => {
            var sn = 15
            var shift = 666
            var msg = (await mpc.customerUT(customer1, sn, shift, false))
            var customerSig = vrs(customer1, msg)
            var ownerSig = vrs(processing, msg)
            await expectThrow(mpc.publishCustomerUT(
                customer1,
                sn, shift,
                customerSig.v, customerSig.r, customerSig.s,
                ownerSig.v, ownerSig.s, ownerSig.r,  // incorrectness: `s` and `r` components are swapped
                false
            ))
        })

        it ('can not post an UT with sequence number less that previous one', async () => {
            var sn = (await mpc.channels(customer1, CUSTOMER))[3].toNumber() - 1
            var shift = 666
            var msg = (await mpc.customerUT(customer1, sn, shift, false))
            var customerSig = vrs(customer1, msg)
            var ownerSig = vrs(processing, msg)
            await expectThrow(mpc.publishCustomerUT(
                customer1,
                sn, shift,
                customerSig.v, customerSig.r, customerSig.s,
                ownerSig.v, ownerSig.r, ownerSig.s, false
            ))
        })

        it ('can not post an UT with balance shift greater than channel balance', async () => {
            var sn = (await mpc.channels(customer1, CUSTOMER))[3].toNumber() + 1
            var shift = (await mpc.channels(customer1, CUSTOMER))[1].toNumber() * 2
            var msg = (await mpc.customerUT(customer1, sn, shift, false))
            var customerSig = vrs(customer1, msg)
            var ownerSig = vrs(processing, msg)
            await expectThrow(mpc.publishCustomerUT(
                customer1,
                sn, shift,
                customerSig.v, customerSig.r, customerSig.s,
                ownerSig.v, ownerSig.r, ownerSig.s, false
            ))
        })


        it ('customer can not close channel before hold time', async () => {
            await expectThrow(mpc.closeCustomerChannel(customer1))
        })

        it ('processing can not close channel before hold time', async () => {
            await expectThrow(mpc.closeCustomerChannel(customer1))
        })

        it('processing can close channnel after hold time', async () => {
            await timeTravel(24 * 60 * 60)
            await mpc.closeCustomerChannel(customer1)
            await assertChannelState(customer1, CUSTOMER, {
                deleted: true
            })
        })

        it('cusomer can close channnel after hold time', async () => {
            await timeTravel(24 * 60 * 60)
            await mpc.closeCustomerChannel(customer2)
            await assertChannelState(customer2, CUSTOMER, {
                deleted: true
            })
        })

        it ('can not post UT to closed channel', async () => {
            var sn = (await mpc.channels(customer1, CUSTOMER))[3].toNumber() + 1
            var shift = 100
            var msg = (await mpc.customerUT(customer1, sn, shift, false))
            var customerSig = vrs(customer1, msg)
            var ownerSig = vrs(processing, msg)
            await expectThrow(mpc.publishCustomerUT(
                customer1,
                sn, shift,
                customerSig.v, customerSig.r, customerSig.s,
                ownerSig.v, ownerSig.r, ownerSig.s, false
            ))
        })


        it('can open channel again', async () => {
            await mpc.newCustomer({ from: customer1, value: 1e18 })
            await assertChannelState(customer1, CUSTOMER, {
                deposited: 1e18,
                spent: 0,
                sn: 0,
            })
        })

        it ('can not post UT from previous channel (reuse)', async () => {
            var sn = 10
            var shift = 200300
            var msg = (await mpc.customerUT(customer1, sn, shift, false))
            // var customerSig = vrs(customer1, msg)
            // var ownerSig = vrs(processing, msg)
            await expectThrow(mpc.publishCustomerUT(
                customer1,
                sn, shift,
                reusingSig[0].v, reusingSig[0].r, reusingSig[0].s,
                reusingSig[1].v, reusingSig[1].r, reusingSig[1].s, false
            ))
        })

        it('can post update tx with immediate close', async () => {
            var sn = 1
            var shift = 100500
            var msg = (await mpc.customerUT(customer1, sn, shift, true))
            var customerSig = vrs(customer1, msg)
            var ownerSig = vrs(processing, msg)
            await mpc.publishCustomerUT(
                customer1,
                sn, shift,
                customerSig.v, customerSig.r, customerSig.s,
                ownerSig.v, ownerSig.r, ownerSig.s,
                true
            )
            await assertChannelState(customer1, CUSTOMER, {
                deleted: true,
            })
        })

    })

    describe('Merchant', function () {

        it('can open channel', async () => {
            await mpc.newCustomer({ from: customer1, value: 4e18 })
            await mpc.newMerchant(merchant1, 1e18, { from: processing })
            await assertChannelState(merchant1, MERCHANT, {
                deposited: 1e18,
                spent: 0,
                sn: 0,
            })
            await assertChannelState(merchant2, MERCHANT, { notExists: true })
            await assertChannelState(merchant1, CUSTOMER, { notExists: true })
        })

        it('can not open second channel for this account', async () => {
            await expectThrow(mpc.newMerchant(merchant1, 1e18, { from: processing }))
        })

        it('can open another channel for another account', async () => {
            await mpc.newMerchant(merchant2, 1e18, { from: processing })
            await assertChannelState(merchant2, MERCHANT, {
                deposited: 1e18,
                spent: 0,
                sn: 0,
            })
        })


        it('can post update tx', async () => {
            var sn = 1
            var shift = 100500
            var msg = (await mpc.merchantUT(merchant1, sn, shift, false))
            var merchantSig = vrs(merchant1, msg)
            var ownerSig = vrs(processing, msg)
            await mpc.publishMerchantUT(
                merchant1,
                sn, shift,
                merchantSig.v, merchantSig.r, merchantSig.s,
                ownerSig.v, ownerSig.r, ownerSig.s, false
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
            var msg = (await mpc.merchantUT(merchant1, sn, shift, false))
            var merchantSig = vrs(merchant1, msg)
            var ownerSig = vrs(processing, msg)
            await mpc.publishMerchantUT(
                merchant1,
                sn, shift,
                merchantSig.v, merchantSig.r, merchantSig.s,
                ownerSig.v, ownerSig.r, ownerSig.s, false
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
            var msg = (await mpc.merchantUT(merchant1, sn, shift, false))
            // var merchantSig = vrs(merchant1, msg)
            // var ownerSig = vrs(processing, msg)
            await expectThrow(mpc.publishMerchantUT(
                merchant1,
                sn, shift,
                reusingSig[0].v, reusingSig[0].r, reusingSig[0].s,
                reusingSig[1].v, reusingSig[1].r, reusingSig[1].s, false
            ))
        })

        it ('can not post UT signed by another merchant', async () => {
            var sn = 15
            var shift = 666
            var msg = (await mpc.merchantUT(merchant1, sn, shift, false))
            var merchantSig = vrs(merchant1, msg)
            var ownerSig = vrs(processing, msg)
            await expectThrow(mpc.publishMerchantUT(
                merchant2,
                sn, shift,
                merchantSig.v, merchantSig.r, merchantSig.s,
                ownerSig.v, ownerSig.r, ownerSig.s, false
            ))
        })

        it ('can not post UT if merchant signature is incorrect', async () => {
            var sn = 15
            var shift = 666
            var msg = (await mpc.merchantUT(merchant1, sn, shift, false))
            var merchantSig = vrs(merchant1, msg)
            var ownerSig = vrs(processing, msg)
            await expectThrow(mpc.publishMerchantUT(
                merchant1,
                sn, shift,
                merchantSig.v, merchantSig.s, merchantSig.r, // incorrectness: `s` and `r` components are swapped
                ownerSig.v, ownerSig.r, ownerSig.s, false
            ))
        })

        it ('can not post UT if owner signature is incorrect', async () => {
            var sn = 15
            var shift = 666
            var msg = (await mpc.merchantUT(merchant1, sn, shift, false))
            var merchantSig = vrs(merchant1, msg)
            var ownerSig = vrs(processing, msg)
            await expectThrow(mpc.publishMerchantUT(
                merchant1,
                sn, shift,
                merchantSig.v, merchantSig.r, merchantSig.s,
                ownerSig.v, ownerSig.s, ownerSig.r, false  // incorrectness: `s` and `r` components are swapped
            ))
        })

        it ('can not post an UT with sequence number less that previous one', async () => {
            var sn = (await mpc.channels(merchant1, MERCHANT))[3].toNumber() - 1
            var shift = 666
            var msg = (await mpc.merchantUT(merchant1, sn, shift, false))
            var merchantSig = vrs(merchant1, msg)
            var ownerSig = vrs(processing, msg)
            await expectThrow(mpc.publishMerchantUT(
                merchant1,
                sn, shift,
                merchantSig.v, merchantSig.r, merchantSig.s,
                ownerSig.v, ownerSig.r, ownerSig.s, false
            ))
        })

        it ('can not post an UT with balance shift greater than channel balance', async () => {
            var sn = (await mpc.channels(merchant1, MERCHANT))[3].toNumber() + 1
            var shift = (await mpc.channels(merchant1, MERCHANT))[1].toNumber() * 2
            var msg = (await mpc.merchantUT(merchant1, sn, shift, false))
            var merchantSig = vrs(merchant1, msg)
            var ownerSig = vrs(processing, msg)
            await expectThrow(mpc.publishMerchantUT(
                merchant1,
                sn, shift,
                merchantSig.v, merchantSig.r, merchantSig.s,
                ownerSig.v, ownerSig.r, ownerSig.s, false
            ))
        })


        it ('merchant can not close channel before hold time', async () => {
            await expectThrow(mpc.closeMerchantChannel(merchant1))
        })

        it ('processing can not close channel before hold time', async () => {
            await expectThrow(mpc.closeMerchantChannel(merchant1))
        })

        it('processing can close channnel after hold time', async () => {
            await timeTravel(24 * 60 * 60)
            await mpc.closeMerchantChannel(merchant1)
            await assertChannelState(merchant1, MERCHANT, {
                deleted: true
            })
        })

        it('merchant can close channnel after hold time', async () => {
            await timeTravel(24 * 60 * 60)
            await mpc.closeMerchantChannel(merchant2)
            await assertChannelState(merchant2, MERCHANT, {
                deleted: true
            })
        })

        it ('can not post UT to closed channel', async () => {
            var sn = (await mpc.channels(merchant1, MERCHANT))[3].toNumber() + 1
            var shift = 100
            var msg = (await mpc.merchantUT(merchant1, sn, shift, false))
            var merchantSig = vrs(merchant1, msg)
            var ownerSig = vrs(processing, msg)
            await expectThrow(mpc.publishMerchantUT(
                merchant1,
                sn, shift,
                merchantSig.v, merchantSig.r, merchantSig.s,
                ownerSig.v, ownerSig.r, ownerSig.s, false
            ))
        })


        it('can open channel again', async () => {
            await mpc.newMerchant(merchant1, 1e16, { from: processing })
            await assertChannelState(merchant1, MERCHANT, {
                deposited: 1e16,
                spent: 0,
                sn: 0,
            })
        })

        it ('can not post UT from previous channel (reuse)', async () => {
            var sn = 10
            var shift = 200300
            var msg = (await mpc.merchantUT(merchant1, sn, shift, false))
            await expectThrow(mpc.publishMerchantUT(
                merchant1,
                sn, shift,
                reusingSig[0].v, reusingSig[0].r, reusingSig[0].s,
                reusingSig[1].v, reusingSig[1].r, reusingSig[1].s, false
            ))
        })

        it('can post update tx with immediate close', async () => {
            var sn = 1
            var shift = 100500
            var msg = (await mpc.merchantUT(merchant1, sn, shift, true))
            var merchantSig = vrs(merchant1, msg)
            var ownerSig = vrs(processing, msg)
            await mpc.publishMerchantUT(
                merchant1,
                sn, shift,
                merchantSig.v, merchantSig.r, merchantSig.s,
                ownerSig.v, ownerSig.r, ownerSig.s,
                true
            )
            await assertChannelState(merchant1, MERCHANT, {
                deleted: true,
            })
        })
    })
})