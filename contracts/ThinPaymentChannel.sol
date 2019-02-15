// pragma solidity ^0.4.19;

// /**
//  * The PaymentChannelEngine contract
//  */
// contract PaymentChannelEngine {
//     enum ChannelState {
//         INACTIVE,       // - contract in this state never should be used,
//                         //   contract closing is valid reason for the
//                         //   contarct to be INACTIVE
//         New,            // - has been created, but not confirmed yet
//         Open,           // - channel is active now, accepting update transactions
//         Closed          // - just stays for the sake of clarity, as the contarct is killed
//                         //   after closing, it would be INACTIVE
//     }


//     function messageToBeSigned (
//         uint256 _ord,
//         uint256 _balanceShift,
//         bool _immediateClose
//     )
//         public view returns (bytes32)
//     {
//         byte close;
//         if (_immediateClose) {
//             close = 0x01;
//         }

//         return keccak256(
//             bytes32(msg.sender),
//             bytes32(_ord),
//             bytes32(_balanceShift),
//             bytes32(PaymentChannel(msg.sender).channelVolume()),
//             close);
//     }


//     function signatureCorrect (
//         address _account,
//         bytes32 _h, uint8 _v, bytes32 _r, bytes32 _s
//     )
//         public pure returns (bool)
//     {
//         return _account == ecrecover(_h, _v, _r, _s);
//     }



//     function PaymentChannelEngine () {

//     }

//     modifier onlyAfterHoldPeriod (uint256 lastUpdateBlock, uint256 holdPeriod) {
//         require (block.number >= lastUpdateBlock + holdPeriod);
//         _;
//     }

//     modifier onlyPayer (address payer) {
//         require (msg.sender == payer);
//         _;
//     }

//     modifier onlyParticipants (address payer, address payee) {
//         require (msg.sender == payer || msg.sender == payee);
//         _;
//     }

//     modifier onlyWithState (ChannelState desiredState, ChannelState state) {
//         require (state == desiredState);
//         _;
//     }
// }


// /**
//  * Assymetric payment channel
//  */
// contract PaymentChannel {

//     PaymentChannelEngine public engine;

//     // parties in the contract
//     address public payer;
//     address public payee;

//     uint256 public channelVolume;   // amount of Ether that both parties should transfer to contract
//     uint256 public balanceShift;    // resulted balance difference from initial 0s
//     uint256 public sequenceNumber;  // number of last update transaction
//     bool public explicitClose;

//     uint public holdPeriod;          // hold period (blocks)
//     uint public lastUpdateBlock;     // block number of last update transaction

//     PaymentChannelEngine.ChannelState public state;


//     function PaymentChannel (
//         PaymentChannelEngine _engine,
//         address _payer,
//         address _payee,
//         uint256 _channelVolume,
//         uint256 _holdPeriod
//     )
//         public payable
//     {
//         // require (_engine != 0x0);
//         require (_payer != 0x0);
//         require (_payee != 0x0);
//         require (_payee != _payer);
//         require (_holdPeriod > 0);
//         require (_channelVolume > 0);

//         require (msg.value == 0 ||
//             (msg.sender == _payer && msg.value == _channelVolume));

//         engine = _engine;
//         payer = _payer;
//         payee = _payee;
//         channelVolume = _channelVolume;
//         holdPeriod = _holdPeriod;

//         if (msg.value == 0) {
//             state = PaymentChannelEngine.ChannelState.New;
//         } else {
//             state = PaymentChannelEngine.ChannelState.Open;
//             lastUpdateBlock = block.number;
//         }
//     }

//     function ( ) public payable onlyWithState(PaymentChannelEngine.ChannelState.New, state)
//     {
//         require (msg.sender == payee);
//         require (msg.value == channelVolume);

//         lastUpdateBlock = block.number;
//         state = PaymentChannelEngine.ChannelState.Open;
//     }

//     function updateTransaction (
//         uint256 _sequenceNumber,
//         uint256 _balanceShift,
//         bool _immediateClose,
//         uint8 _vA, bytes32 _rA, bytes32 _sA,
//         uint8 _vB, bytes32 _rB, bytes32 _sB
//     )
//         public
//         onlyWithState(PaymentChannelEngine.ChannelState.Open, state)
//     {
//         // validating update transaction
//         require (sequenceNumber < _sequenceNumber);
//         require (channelVolume > _balanceShift);
//         require (channelVolume + _balanceShift > channelVolume);

//         // validating signatures
//         bytes32 rawMsg = engine.messageToBeSigned(
//             _sequenceNumber,
//             _balanceShift,
//             _immediateClose); // message encrypted by both counterparts

//         require (engine.signatureCorrect(payer, rawMsg, _vA, _rA, _sA));
//         require (engine.signatureCorrect(payee, rawMsg, _vB, _rB, _sB));

//         // updating channel state
//         sequenceNumber = _sequenceNumber;
//         balanceShift = _balanceShift;
//         lastUpdateBlock = block.number;
//         if (_immediateClose) {
//             closeChannel();
//         }
//     }

//     function cancel ()
//         public
//         onlyWithState(PaymentChannelEngine.ChannelState.New, state)
//         onlyPayer
//     {
//         selfdestruct(payer);
//     }

//     function claim ( )
//         public
//         onlyWithState(PaymentChannelEngine.ChannelState.Open)
//         onlyParticipants
//         onlyAfterHoldPeriod
//     {
//         closeChannel();
//     }

//     function closeChannel ( )
//         internal
//         onlyWithState(PaymentChannelEngine.ChannelState.Open, state)
//         onlyParticipants
//     {
//         if (balanceShift > 0) {                 // TODO: check for recursion
//             uint256 tmp = balanceShift;
//             balanceShift = 0;
//             if (payee.send(tmp)) {
//                 state = PaymentChannelEngine.ChannelState.Closed;
//                 selfdestruct(payer);
//             }
//         }
//     }



// }
