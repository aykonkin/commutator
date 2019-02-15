// /* pragma solidity ^0.4.21;

// import "./MultiPaymentChannelHashlocks.sol";

// contract MultiPaymentChannelHashlocksErrcodes is MultiPaymentChannelHashlocks {


//     /****************************** ERROR CODES ******************************
//      *
//      *      1   -   SUCCESS
//      *
//      *      10  -   `msg.sender` is not channel participant
//      *      11  -   `msg.sender` is not owner
//      *
//      *      100 -   channel can not be closed, use `channelCanBeClosedByTimer`
//      *              and `channelCanBeClosedBySignature` for details
//      *
//      *      200 -   invalid customer UT
//      *      201 -   invalid merchant UT
//      *      210 -   signature A incorrect
//      *      211 -   signature B incorrect
//      *
//      *      300 -   not enough funds
//      *
//      *      400 -   channel not exists
//      *      401 -   not enough deposited funds
//      *      402 -   sequence number is too old
//      *
//      *      500 -   channel already exists
//      *      501 -   zero deposit
//      *      502 -   invalid counterpart (0x0)
//      *
//      */

//     function newCustomerERR () public view returns (uint256) {
//         return _openChannelERR(msg.sender, ChannelType.CUSTOMER, msg.value);
//     }

//     function closeCustomerChannelERR (
//         address _customer,
//         bytes32 _sigA,
//         bytes32 _sigB,
//         bool _close
//     ) public view returns (uint256)
//     {
//         if (msg.sender != owner && msg.sender != _customer) {
//             return 10;
//         }

//         if (
//             !channelCanBeClosedByTimer(_customer, ChannelType.CUSTOMER) &&
//             !channelCanBeClosedBySignature(_customer, ChannelType.CUSTOMER, _sigA, _sigB)
//         ) {
//             return 100;
//         }

//         return 1;
//     }

//     function publishCustomerUTERR (
//         address _customer,
//         uint256 _sequenceNumber,
//         uint256 _balanceShift,
//         uint8 _vA, bytes32 _rA, bytes32 _sA, // customer
//         uint8 _vB, bytes32 _rB, bytes32 _sB  // owner (processing)
//     ) public view returns (uint256)
//     {
//         if (!validCustomerUT(_customer, _sequenceNumber, _balanceShift)) {
//             return 200;
//         }
//         bytes32 message = customerUT(_customer, _sequenceNumber, _balanceShift);
//         if (!_signatureCorrect(_customer, message, _vA, _rA, _sA)) {
//             return 210;
//         }
//         if (!_signatureCorrect(owner, message, _vB, _rB, _sB)) {
//             return 211;
//         }
//         return 1;
//     }

//     function newMerchantERR (address _merchant, uint256 _reserve) public view returns (uint256) {
//         if (msg.sender != owner) {
//             return 11;
//         }
//         if (_reserve < freeFunds()) {
//             return 300;
//         }
//         return _openChannelERR(_merchant, ChannelType.MERCHANT, _reserve);
//     }

//     function closeMerchantChannelERR (
//         address _merchant,
//         bytes32 _sigA,
//         bytes32 _sigB
//     ) public view returns (uint256)
//     {
//         if (msg.sender != owner && msg.sender != _merchant) {
//             return 10;
//         }

//         if (
//             !channelCanBeClosedByTimer(_merchant, ChannelType.CUSTOMER) &&
//             !channelCanBeClosedBySignature(_merchant, ChannelType.CUSTOMER, _sigA, _sigB)
//         ) {
//             return 100;
//         }

//         return 1;
//     }

//     function publishMerchantUTERR (
//         address _merchant,
//         uint256 _sequenceNumber,
//         uint256 _balanceShift,
//         uint8 _vA, bytes32 _rA, bytes32 _sA, // customer
//         uint8 _vB, bytes32 _rB, bytes32 _sB  // owner (processing)
//     ) public view returns (uint256)
//     {
//         if (!validMerchantUT(_merchant, _sequenceNumber, _balanceShift)) {
//             return 201;
//         }
//         bytes32 message = merchantUT(_merchant, _sequenceNumber, _balanceShift);
//         if (!_signatureCorrect(_merchant, message, _vA, _rA, _sA)) {
//             return 210;
//         }
//         if (!_signatureCorrect(owner, message, _vB, _rB, _sB)) {
//             return 211;
//         }
//         return 1;
//     }

//     function _validUTERR (
//         address _counterpart,
//         ChannelType _type,
//         uint256 _sequenceNumber,
//         uint256 _balanceShift
//     ) public view returns (uint256)
//     {
//         PaymentChannel memory channel = channels[_counterpart][uint8(_type)];
//         if (channel.created == 0) {
//             return 400;
//         }
//         if (channel.deposited < _balanceShift) {
//             return 401;
//         }
//         if (channel.sequenceNumber >= _sequenceNumber) {
//             return 402;
//         }
//         return 1;
//     }

//     function _signatureCorrectRECOVER (
//         bytes32 _h, uint8 _v, bytes32 _r, bytes32 _s
//     ) public pure returns (address)
//     {
//         return ecrecover(keccak256("\x19Ethereum Signed Message:\n32", _h), _v, _r, _s);
//     }

//     function _openChannelERR(
//         address _counterpart,
//         ChannelType _type,
//         uint256 _deposit
//     ) public view returns (uint256)
//     {
//         if (channels[_counterpart][uint8(_type)].created != 0) {
//             return 500;
//         }
//         if (_deposit == 0) {
//             return 501;
//         }
//         if (_counterpart == 0x0) {
//             return 502;
//         }
//         return 1;
//     }

//     function publishCustomerUTHashlockERR (
//         address _customer,
//         uint256 _sequenceNumber,
//         uint256 _balanceShift,
//         uint8 _vA, bytes32 _rA, bytes32 _sA, // customer
//         uint8 _vB, bytes32 _rB, bytes32 _sB,  // owner (processing)
//         bytes32 _hashlockPlain
//     ) public returns (uint256) {
//         bytes32 _hashlock = sha256(_hashlockPlain);
//         if (!validCustomerUT(_customer, _sequenceNumber, _balanceShift)) {
//             return 200;
//         }
//         bytes32 message = customerUTHashlock(_customer, _sequenceNumber, _balanceShift, _hashlock);
//         if (!_signatureCorrect(_customer, message, _vA, _rA, _sA)) {
//             return 210;
//         }
//         if (!_signatureCorrect(owner, message, _vB, _rB, _sB)) {
//             return 211;
//         }
//         return 1;
//     }

//     function publishMerchantUTHashlockERR (
//         address _merchant,
//         uint256 _sequenceNumber,
//         uint256 _balanceShift,
//         uint8 _vA, bytes32 _rA, bytes32 _sA, // merchant
//         uint8 _vB, bytes32 _rB, bytes32 _sB,  // owner (processing)
//         bytes32 _hashlockPlain
//     ) public returns (uint256) {
//         bytes32 _hashlock = sha256(_hashlockPlain);
//         if (!validMerchantUT(_merchant, _sequenceNumber, _balanceShift)) {
//             return 201;
//         }
//         bytes32 message = merchantUTHashlock(_merchant, _sequenceNumber, _balanceShift, _hashlock);
//         if (!_signatureCorrect(_merchant, message, _vA, _rA, _sA)) {
//             return 210;
//         }
//         if (!_signatureCorrect(owner, message, _vB, _rB, _sB)) {
//             return 211;
//         }
//         return 1;
//     }


// } */