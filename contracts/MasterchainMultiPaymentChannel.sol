pragma solidity ^0.4.16;

import "./MultiPaymentChannel.sol";

contract MasterchainMultiPaymentChannel is MultiPaymentChannel {

    function _signatureCorrect (
        address _wallet,
        bytes32 _h, uint8 _v, bytes32 _r, bytes32 _s
    ) public pure returns (bool)
    {
        return _wallet == ecrecover(sha256("\x19Signed Message:\n32", _h), _v, _r, _s);
    }

}
