import json
import web3

from web3 import Web3
from solc import compile_source
from web3.contract import ConciseContract

contract_source_code = '''
pragma solidity ^0.4.21;

contract Greeter {
    string public greeting;

    event Kaboom (address indexed boomer);
    event Daboom ();

    function Greeter() public {
        emit Daboom();
        emit Kaboom(address(0));
        greeting = 'Hello';
    }

    function setGreeting(string _greeting) public {
        emit Daboom();
        emit Kaboom(msg.sender);
        greeting = _greeting;
    }

    function greet() view public returns (string) {
        return greeting;
    }
}
'''

compiled_sol = compile_source(contract_source_code) # Compiled source code
contract_interface = compiled_sol['<stdin>:Greeter']

w3 = Web3(Web3.HTTPProvider("http://127.0.0.1:8545"))

w3.eth.defaultAccount = w3.eth.accounts[0]
Greeter = w3.eth.contract(abi=contract_interface['abi'], bytecode=contract_interface['bin'])
tx_hash = Greeter.constructor().transact()
tx_receipt = w3.eth.waitForTransactionReceipt(tx_hash)
greeter = w3.eth.contract(
    address=tx_receipt.contractAddress,
    abi=contract_interface['abi'],
)
tx_hash = greeter.functions.setGreeting('Nihao').transact()
# Wait for transaction to be mined...
w3.eth.waitForTransactionReceipt(tx_hash)

### FILTERS STARTS HERE

event_filter = greeter.events.Kaboom.createFilter(fromBlock=0)
print ('=== get_all_entries')
print (event_filter.get_all_entries())
