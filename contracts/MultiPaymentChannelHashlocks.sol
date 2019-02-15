pragma solidity ^0.4.16;

import "./MultiPaymentChannel.sol";

contract MultiPaymentChannelHashlocks is MultiPaymentChannel {


    function customerUTHashlock (
        address _customer,
        uint256 _sequenceNumber,
        uint256 _balanceShift,
        bool _close,
        bytes32 _hashlock
    ) public view returns (bytes32)
    {
        return _utHashlock(_customer, ChannelType.CUSTOMER, _sequenceNumber, _balanceShift, _close, _hashlock);
    }


    function publishCustomerUTHashlock (
        address _customer,
        uint256 _sequenceNumber,
        uint256 _balanceShift,
        uint8 _vA, bytes32 _rA, bytes32 _sA, // customer
        uint8 _vB, bytes32 _rB, bytes32 _sB,  // owner (processing)
        bool _close,
        bytes32 _hashlockPlain
    ) public returns (bool) {
        bytes32 _hashlock = sha256(_hashlockPlain);
        require (validCustomerUT(_customer, _sequenceNumber, _balanceShift, _close));
        bytes32 message = customerUTHashlock(_customer, _sequenceNumber, _balanceShift, _close, _hashlock);
        require (_signatureCorrect(_customer, message, _vA, _rA, _sA));
        require (_signatureCorrect(owner, message, _vB, _rB, _sB));
        return _applyUpdateTransaction(_customer, ChannelType.CUSTOMER, _sequenceNumber, _balanceShift, _close);
    }


    function merchantUTHashlock (
        address _merchant,
        uint256 _sequenceNumber,
        uint256 _balanceShift,
        bool _close,
        bytes32 _hashlock
    ) public view returns (bytes32)
    {
        return _utHashlock(_merchant, ChannelType.MERCHANT, _sequenceNumber, _balanceShift, _close, _hashlock);
    }


    function publishMerchantUTHashlock (
        address _merchant,
        uint256 _sequenceNumber,
        uint256 _balanceShift,
        uint8 _vA, bytes32 _rA, bytes32 _sA, // merchant
        uint8 _vB, bytes32 _rB, bytes32 _sB,  // owner (processing)
        bool _close,
        bytes32 _hashlockPlain
    ) public returns (bool) {
        bytes32 _hashlock = sha256(_hashlockPlain);
        require (validMerchantUT(_merchant, _sequenceNumber, _balanceShift, _close));
        bytes32 message = merchantUTHashlock(_merchant, _sequenceNumber, _balanceShift, _close, _hashlock);
        require (_signatureCorrect(_merchant, message, _vA, _rA, _sA));
        require (_signatureCorrect(owner, message, _vB, _rB, _sB));
        return _applyUpdateTransaction(_merchant, ChannelType.MERCHANT, _sequenceNumber, _balanceShift, _close);
    }


    function _utHashlock (
        address _counterpart,
        ChannelType _type,
        uint256 _sequenceNumber,
        uint256 _balanceShift,
        bool _close,
        bytes32 _hashlock
    ) public view returns (bytes32)
    {
        return sha256(
            address(this),
            _counterpart,
            _type,
            _sequenceNumber,
            _balanceShift,
            channels[_counterpart][uint8(_type)].created, // prevents reusing
            _close,
            _hashlock
        );
    }

    function hashSHA256 (bytes32 _hashlockPlain) public pure returns (bytes32) {
        return sha256(_hashlockPlain);
    }

}
