## MultiPaymentChannel.sol

### Features

  * Ether management **done**
  * Channel management **done**
  * ECRecover **done**
  * Hashlocks **done**
  * Processing's own funds (liquidity)

### Workflow

### Customer channels

#### External writable functions

  * `function newCustomer () external payable returns (bool)`

    Should be called by *customer* with non-zero Ether transaction value. Opens new channel.
    Will throw if channel with this account is already exists.

  * `function closeCustomerChannel (address _customer, bytes32 _sigA, bytes32 _sigB) external onlyChannelParticipant(_customer) returns (bool)`

    Can be called either by the *customer* or *processing*. `_customer` is used as channel identificator. `_sigA` and `_sigB` are for immediate close (not implemented yet). Will throw if channel cannot be closed. If closing conditions are met, will `transfer` to customer unspent funds.

  * `function publishCustomerUT (address _customer, uint256 _sequenceNumber, uint256 _balanceShift, uint8 _vA, bytes32 _rA, bytes32 _sA, uint8 _vB, bytes32 _rB, bytes32 _sB) public returns (bool)`

    Can be called by anyone. Update transaction parameters are: `_customer`, `_sequenceNumber` and `_balanceShift`.
    `_vA`, `_rA` and `_sA` are components of *customer* signature.
    `_vB`, `_rB` and `_sB` are components of *processing* signature.

#### Constant functions

  * `function customerUT (address _customer, uint256 _sequenceNumber, uint256 _balanceShift) public view returns (bytes32)`

  Returns `bytes32` message hash to be signed for update transaction.

  * `function validCustomerUT (address _customer, uint256 _sequenceNumber, uint256 _balanceShift) public view returns (bool)`

  Returns `true` if `_sequenceNumber` and `_balanceShift` are in valid range for *customer payment channel* opened with `_customer`.


### Merchant channels

#### External writable functions

  * `function newMerchant (address _merchant, uint256 _reserve) onlyOwner external returns (bool)`

    Should be called by *processing*. Opens new channel with `_merchant` for `_reserve` Eth.
    Will throw if channel with this account is already exists.

  * `function closeMerchantChannel (address _merchant, bytes32 _sigA, bytes32 _sigB) external onlyChannelParticipant(_merchant) returns (bool)`

    Can be called either by the *merchant* or *processing*. `_merchant` is used as channel identificator. `_sigA` and `_sigB` are for immediate close (not implemented yet). Will throw if channel cannot be closed. If closing conditions are met, will `transfer` to *merchant* earned funds.

  * `function publishMerchantUT (address _merchant, uint256 _sequenceNumber, uint256 _balanceShift, uint8 _vA, bytes32 _rA, bytes32 _sA, uint8 _vB, bytes32 _rB, bytes32 _sB) public returns (bool)`

    Can be called by anyone. Update transaction parameters are: `_merchant`, `_sequenceNumber` and `_balanceShift`.
    `_vA`, `_rA` and `_sA` are components of *merchant* signature.
    `_vB`, `_rB` and `_sB` are components of *processing* signature.

#### Constant functions

  * `function merchantUT (address _merchant, uint256 _sequenceNumber, uint256 _balanceShift) public view returns (bytes32)`

  Returns `bytes32` message hash to be signed for update transaction.

  * `function validMerchantUT (address _merchant, uint256 _sequenceNumber, uint256 _balanceShift) public view returns (bool)`

  Returns `true` if `_sequenceNumber` and `_balanceShift` are in valid range for *merchant payment channel* opened with `_merchant`.



## MPCH_ErrCodes

Adds functions for testing internals on MultiPaymentChannel's.
For every non-constant function there is a function with same parameters that returns `uint256` error code is something is wrong, `0` otherwise. Naming conventions: `functionName + "ERR" + same parameters`
Error codes as follows:

* **10**:  `msg.sender` is not channel participant
* **11**:  `msg.sender` is not owner
* **100**: channel can not be closed, use `channelCanBeClosedByTimer` and `channelCanBeClosedBySignature` for details
* **200**: invalid customer UT
* **201**: invalid merchant UT
* **210**: signature A incorrect
* **211**: signature B incorrect
* **300**: not enough funds
* **400**: channel not exists
* **401**: not enough deposited funds
* **402**: sequence number is too old
* **500**: channel already exists
* **501**: zero deposit
* **502**: invalid counterpart (`0x0`)

Extra testing is `function _signatureCorrectRECOVER (bytes32 _h, uint8 _v, bytes32 _r, bytes32 _s) public pure returns (address)` for restoring signer address from message and signature.
