pragma solidity ^0.4.16;


contract MultiPaymentChannel {

    enum ChannelType {
        UNKNOWN,
        CUSTOMER,
        MERCHANT
    }

    address public owner;
    mapping (address => mapping (uint8 => PaymentChannel)) public channels;

    uint256 constant public holdTime = 24 * 60 * 60;

    uint256 public totalCustomersFunds;
    uint256 public totalMerchantFunds;
    uint256 public totalProcessingFunds;

    struct PaymentChannel {
        uint256 created;
        uint256 deposited;
        uint256 spent;
        uint256 sequenceNumber;
        uint256 lastUpdate;
    }

    event Deployed();
    event ProcessingDeposit(uint256 amount);
    event ProcessingWithdraw(uint256 amount);
    event ChannelCreated(address indexed counterpart, uint256 indexed channelType, uint256 volume);
    event ChannelUpdated(address indexed counterpart, uint256 indexed channelType, uint256 sequenceNumber, uint256 spent, bool close);
    event ChannelClosed(address indexed counterpart, uint256 indexed channelType);


    function MultiPaymentChannel () public payable {
        owner = msg.sender;
        totalProcessingFunds += msg.value;
        Deployed();
    }


    /**
     *   Processing funds management
     */


    function processingDeposit () external payable onlyOwner returns (bool)  {
        totalProcessingFunds += msg.value;
        ProcessingDeposit(msg.value);
        return true;
    }


    function processingWithdraw (uint256 _withdrawAmount)
        external
        onlyOwner
        returns (bool)
    {
        require (_withdrawAmount <= freeFunds());
        require (_withdrawAmount <= totalProcessingFunds);
        totalProcessingFunds -= _withdrawAmount;
        owner.transfer(_withdrawAmount);
        ProcessingWithdraw(msg.value);
        return true;
    }


    /**
     *   Customer payment channels
     */


    function newCustomer () external payable returns (bool) {
        require (_openChannel(msg.sender, ChannelType.CUSTOMER, msg.value));
        totalCustomersFunds += msg.value;
        return true;
    }


    function closeCustomerChannel ( address _customer )
        external onlyChannelParticipant(_customer) returns (bool)
    {
        require (channelCanBeClosedByTimer(_customer, ChannelType.CUSTOMER));
        return _closeCustomerChannel(_customer);
    }


    function _closeCustomerChannel (address _customer) internal returns (bool) {
        uint256 payToCustomer = toBePayedOnChannelClose(_customer, ChannelType.CUSTOMER);
        require(_eraseChannelRecord(_customer, ChannelType.CUSTOMER));
        totalCustomersFunds -= payToCustomer;
        _customer.transfer(payToCustomer);
        return true;
    }


    function customerUT (
        address _customer,
        uint256 _sequenceNumber,
        uint256 _balanceShift,
        bool _close
    ) public view returns (bytes32)
    {
        return _ut(_customer, ChannelType.CUSTOMER, _sequenceNumber, _balanceShift, _close);
    }


    function validCustomerUT (
        address _customer,
        uint256 _sequenceNumber,
        uint256 _balanceShift,
        bool _close
    ) public view returns (bool) {
        return _validUT(_customer, ChannelType.CUSTOMER, _sequenceNumber, _balanceShift, _close);
    }


    function publishCustomerUT (
        address _customer,
        uint256 _sequenceNumber,
        uint256 _balanceShift,
        uint8 _vA, bytes32 _rA, bytes32 _sA, // customer
        uint8 _vB, bytes32 _rB, bytes32 _sB,  // owner (processing)
        bool _close
    ) public returns (bool) {
        require (validCustomerUT(_customer, _sequenceNumber, _balanceShift, _close));
        bytes32 message = customerUT(_customer, _sequenceNumber, _balanceShift, _close);
        require (_signatureCorrect(_customer, message, _vA, _rA, _sA));
        require (_signatureCorrect(owner, message, _vB, _rB, _sB));
        return _applyUpdateTransaction(_customer, ChannelType.CUSTOMER, _sequenceNumber, _balanceShift, _close);
    }

//


    function newMerchant (address _merchant, uint256 _reserve)
        onlyOwner external returns (bool)
    {
        require (_reserve <= freeFunds());
        require (_openChannel(_merchant, ChannelType.MERCHANT, _reserve));
        totalMerchantFunds += _reserve;
        return true;
    }


    function closeMerchantChannel ( address _merchant )
        external onlyChannelParticipant(_merchant) returns (bool)
    {
        require (channelCanBeClosedByTimer(_merchant, ChannelType.MERCHANT));
        return _closeMerchantChannel(_merchant);
    }


    function _closeMerchantChannel (address _merchant) internal returns (bool) {
        uint256 payToMerchant = toBePayedOnChannelClose(_merchant, ChannelType.MERCHANT);
        uint256 freezed = channels[_merchant][uint8(ChannelType.MERCHANT)].deposited;
        require(_eraseChannelRecord(_merchant, ChannelType.MERCHANT));
        _merchant.transfer(payToMerchant);
        totalMerchantFunds -= freezed;
        return true;
    }


    function merchantUT (
        address _merchant,
        uint256 _sequenceNumber,
        uint256 _balanceShift,
        bool _close
    ) public view returns (bytes32)
    {
        return _ut(_merchant, ChannelType.MERCHANT, _sequenceNumber, _balanceShift, _close);
    }


    function validMerchantUT (
        address _merchant,
        uint256 _sequenceNumber,
        uint256 _balanceShift,
        bool _close
    ) public view returns (bool) {
        return _validUT(_merchant, ChannelType.MERCHANT, _sequenceNumber, _balanceShift, _close);
    }


    function publishMerchantUT (
        address _merchant,
        uint256 _sequenceNumber,
        uint256 _balanceShift,
        uint8 _vA, bytes32 _rA, bytes32 _sA, // merchant
        uint8 _vB, bytes32 _rB, bytes32 _sB, // owner (processing)
        bool _close
    ) public returns (bool) {
        require (validMerchantUT(_merchant, _sequenceNumber, _balanceShift, _close));
        bytes32 message = merchantUT(_merchant, _sequenceNumber, _balanceShift, _close);
        require (_signatureCorrect(_merchant, message, _vA, _rA, _sA));
        require (_signatureCorrect(owner, message, _vB, _rB, _sB));
        return _applyUpdateTransaction(_merchant, ChannelType.MERCHANT, _sequenceNumber, _balanceShift, _close);
    }

//


    function _ut (
        address _counterpart,
        ChannelType _type,
        uint256 _sequenceNumber,
        uint256 _balanceShift,
        bool _close
    ) public view returns (bytes32)
    {
        return sha256(
            address(this),
            _counterpart,
            _type,
            _sequenceNumber,
            _balanceShift,
            _close,
            channels[_counterpart][uint8(_type)].created // prevents reusing
        );
    }


    function _validUT (
        address _counterpart,
        ChannelType _type,
        uint256 _sequenceNumber,
        uint256 _balanceShift,
        bool _close
    ) internal view returns (bool)
    {
        PaymentChannel memory channel = channels[_counterpart][uint8(_type)];
        require (channel.created != 0);
        require (channel.deposited >= _balanceShift);
        require (channel.sequenceNumber < _sequenceNumber);
        return true;
    }

    // // debug function
    // function recover (bytes32 _h, uint8 _v, bytes32 _r, bytes32 _s) public pure returns (address) {
    //     return ecrecover(keccak256("\x19Ethereum Signed Message:\n32", _h), _v, _r, _s);
    // }

    // // alternative implementation
    // function recover2(bytes32 hash, bytes sig)
    //   public
    //   pure
    //   returns (address)
    // {
    //   bytes32 r;
    //   bytes32 s;
    //   uint8 v;
    //
    //   // Check the signature length
    //   if (sig.length != 65) {
    //     return (address(0));
    //   }
    //
    //   // Divide the signature in r, s and v variables
    //   // ecrecover takes the signature parameters, and the only way to get them
    //   // currently is to use assembly.
    //   // solium-disable-next-line security/no-inline-assembly
    //   assembly {
    //     r := mload(add(sig, 32))
    //     s := mload(add(sig, 64))
    //     v := byte(0, mload(add(sig, 96)))
    //   }
    //
    //   // Version of signature should be 27 or 28, but 0 and 1 are also possible versions
    //   if (v < 27) {
    //     v += 27;
    //   }
    //
    //   // If the version is correct return the signer address
    //   if (v != 27 && v != 28) {
    //     return (address(0));
    //   } else {
    //     // solium-disable-next-line arg-overflow
    //     return ecrecover(keccak256("\x19Ethereum Signed Message:\n32", hash), v, r, s);
    //   }
    // }

    function _signatureCorrect (
        address _wallet,
        bytes32 _h, uint8 _v, bytes32 _r, bytes32 _s
    ) public pure returns (bool)
    {
        return _wallet == ecrecover(keccak256("\x19Ethereum Signed Message:\n32", _h), _v, _r, _s);
    }


    function freeFunds ()
        internal view returns (uint256)
    {
        return address(this).balance - totalMerchantFunds;
    }


    function channelCanBeClosedByTimer(address _counterpart, ChannelType _type)
        internal view returns (bool)
    {
        return channels[_counterpart][uint8(_type)].lastUpdate + holdTime <= block.timestamp;
    }


    function toBePayedOnChannelClose(address _counterpart, ChannelType _type)
        internal view returns (uint256)
    {
        PaymentChannel memory pc = channels[_counterpart][uint8(_type)];
        if (_type == ChannelType.CUSTOMER) {
            return pc.deposited - pc.spent;
        } else if (_type == ChannelType.MERCHANT) {
            return pc.spent;
        }
    }


    function channelCanBeClosedBySignature(address _counterpart, ChannelType _type, bytes32 _sigA, bytes32 _sigB)
        internal view returns (bool)
    {
        return false;
    }


    /**
     *   Low-level functions for payment channels section
     */

    function _openChannel(
        address _counterpart,
        ChannelType _type,
        uint256 _deposit
    ) internal returns (bool) {
        require(channels[_counterpart][uint8(_type)].created == 0);
        require(_deposit > 0);
        require(_counterpart != 0x0);

        channels[_counterpart][uint8(_type)] = PaymentChannel(
            block.timestamp,    // uint256 created
            _deposit,           // uint256 deposited
            0,                  // uint256 spent
            0,                  // uint256 sequenceNumber
            block.timestamp     // uint256 lastUpdate
        );
        ChannelCreated(_counterpart, uint256(_type), _deposit);
        return true;
    }


    function _applyUpdateTransaction(
        address _counterpart,
        ChannelType _type,
        uint256 _sequenceNumber,
        uint256 _spent,
        bool _close
    ) internal returns (bool) {
        PaymentChannel storage channel = channels[_counterpart][uint8(_type)];
        channel.sequenceNumber = _sequenceNumber;
        channel.spent = _spent;
        channel.lastUpdate = block.timestamp;
        if (_close) {
            if (_type == ChannelType.CUSTOMER) {
                require (_closeCustomerChannel(_counterpart));
            } else if (_type == ChannelType.MERCHANT) {
                require (_closeMerchantChannel(_counterpart));
            }
        }
        ChannelUpdated(_counterpart, uint256(_type), _sequenceNumber, _spent, _close);
        return true;
    }


    function _eraseChannelRecord(
        address _counterpart,
        ChannelType _type
    ) internal returns (bool) {
        delete channels[_counterpart][uint8(_type)];
        ChannelClosed(_counterpart, uint256(_type));
        return true;
    }


    modifier onlyOwner() {
        require (msg.sender == owner);
        _;
    }


    modifier onlyChannelParticipant(address _counterpart) {
        require (msg.sender == owner || msg.sender == _counterpart);
        _;
    }


}
