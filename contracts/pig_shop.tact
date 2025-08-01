import "@stdlib/deploy"; // Ensure standard library is imported
import "./messages.tact";
import "./NFT.tact";
message UpgradePig {
  userAddress: Address;
  amount: Int as coins;
}
message ChangeCollection {
  newCollection: Address;
}
message WithdrawLeftovers {}
message PigApproval {
  pig: Address?;
  userAddress: Address;
  referrerNftAddress: Address;
  referrerAmount: Int as coins;
  userBountyHunters: map<Address, Int as coins>;
  adminsShares: map<Address, Int as coins>;
}
message PigCreationEvent {
  userAddress: Address;
  nft: Address;
  nftIndex: Int as uint256;
}
message WithdrawFromPigEvent {
  userAddress: Address;
  nft: Address;
  amount: Int as coins;
}
message PigApprovalEvent {
  userAddress: Address;
  referrerNftAddress: Address;
  referrerAmount: Int as coins;
  userBountyHunters: map<Address, Int as coins>;
  adminsShares: map<Address, Int as coins>;
}
message ChangeLimits {
  level: Int as uint8;
  limit: Int as coins;
}
struct PigShopParams {
  limit1: Int as coins;
  limit2: Int as coins;
  limit3: Int as coins;
  limit4: Int as coins;
  owner: Address;
  collection: Address;
}

inline fun calcItemAddress(nftCollectionAddress: Address,
  itemIndex: Int): Address {
  let i = initOf Pig(nftCollectionAddress, itemIndex);
  return contractAddress(i);
}

contract PigShop {
  collection: Address?;
  owner: Address;
  limits: map<Int as uint8, Int as coins> = emptyMap();
  // Initialize the owner in the init() function
  init(id: Int as uint64, owner: Address){
    self.owner = owner;
    self.limits.set(1, ton("20"));
    self.limits.set(2, ton("200"));
    self.limits.set(3, ton("2000"));
    self.limits.set(4, ton("20000"));
  }

  receive(msg: ChangeCollection){
    require(sender() == self.owner, "Only owner can change collection");
    self.collection = msg.newCollection;
    send(SendParameters{
        to: sender(),
        value: 0,
        mode: SendRemainingValue,
        bounce: false
      }
    );
  }

  receive(msg: ChangeLimits){
    require(sender() == self.owner, "Only owner can change limits");
    self.limits.set(msg.level, msg.limit);
    send(SendParameters{
        to: sender(),
        value: 0,
        mode: SendRemainingValue,
        bounce: false
      }
    );
  }

  get fun getParams(): PigShopParams {
    return
      PigShopParams{
        limit1: self.limits.get(1)!!,
        limit2: self.limits.get(2)!!,
        limit3: self.limits.get(3)!!,
        limit4: self.limits.get(4)!!,
        owner: self.owner,
        collection: self.collection!!
      };
  }

  // Empty receiver

  receive(){
    // Refund the remaining value in the incoming message back to the sender
    // send(SendParameters{
    //     to: sender(),
    //     value: 0, // 0 means send no additional value
    //     mode: SendRemainingValue, // Sends the remaining value of the incoming message
    //     bounce: true
    //   }
    // );
  }

  receive(msg: WithdrawLeftovers) {
    require(sender() == self.owner, "Only owner can withdraw leftovers");
    nativeReserve(ton("0.01"), 0);
    send(SendParameters {
      to: self.owner,
      value: 0,
      mode: SendRemainingBalance,
      bounce: false,
    });
  }

  receive("UpgradePig"){
    let ctx:Context  = context();
    emit(UpgradePig{userAddress: sender(), amount: ctx.value}.toCell());
  }

  receive(msg: PigCreation){
    require(sender() == calcItemAddress(self.collection!!, msg.nftIndex),
      "Only NFT item is authorized"
    );
    emit(PigCreationEvent{userAddress: msg.owner, nft: sender(), nftIndex: msg.nftIndex}.toCell());
  }

  receive(msg: WithdrawFromPig){
    require(sender() == calcItemAddress(self.collection!!, msg.nftIndex),
      "Only NFT item is authorized"
    );
    emit(WithdrawFromPigEvent{
        userAddress: msg.owner,
        nft: sender(),
        amount: msg.amount
      }.toCell()
    );
    send(SendParameters {
      to: msg.owner,
      value: 0,
      mode: SendRemainingValue,
      bounce: false,
    });
  }

  receive(msg: PigApproval){
    require(sender() == self.owner, "Only owner can approve a pig purchase");
    let totalAmount = ton("0");
    foreach (k, v in msg.userBountyHunters) {
      totalAmount += v + ton("0.005"); // gas per send
    }
    totalAmount += msg.referrerAmount + ton("0.005"); // referrer + gas
    foreach (k, v in msg.adminsShares) {
      totalAmount += v + ton("0.005"); // admin shares + gas
    }
    if (msg.pig == null) {
      totalAmount += ton("0.135"); // MintNFT operation cost
    } else {
      totalAmount += ton("0.02"); // UpgradeNftPig operation cost
    }

    nativeReserve(totalAmount, ReserveAllExcept);
    // shouldn't be here because of the first ever transaction
    // require(!msg.userBountyHunters.isEmpty() && !msg.adminsShares.isEmpty(),
    //   "Distribution map cannot be empty"
    // );

    // updating the user balances
    foreach (address, amount in msg.userBountyHunters) {
      require(amount > 0, "Amount must be greater than 0");
      send(SendParameters{
          to: address,
          value: amount,
          mode: SendPayGasSeparately,
          bounce: true,
          body: PigBounty{
            limits: self.limits,
            surplusDestination: self.owner
          }.toCell()
        }
      );
    }
    send(SendParameters{
        to: msg.referrerNftAddress,
        value: msg.referrerAmount,
        mode: SendPayGasSeparately,
        bounce: false,
        body: PigBounty{
          limits: self.limits,
          surplusDestination: self.owner
        }.toCell()
      }
    );
    foreach (address, amount in msg.adminsShares) {
      require(amount > 0, "Amount must be greater than 0");
      send(SendParameters{
          to: address,
          value: amount,
          mode: SendPayGasSeparately,
          bounce: false
        }
      );
    }
    if (msg.pig == null) {
      send(SendParameters{
          to: self.collection!!,
          value: ton("0.125"),
          mode: SendPayGasSeparately,
          bounce: false,
          body: MintNFT{
            queryId: 0,
            receiver: msg.userAddress,
            responseDestination: msg.userAddress,
            forwardAmount: ton("0.01"),
            forwardPayload: emptyCell()
          }.toCell()
        }
      );
    } else {
      send(SendParameters{
          to: msg.pig!!,
          value: ton("0.02"),
          mode: SendPayGasSeparately,
          bounce: false,
          body: UpgradeNftPig{}.toCell()
        }
      );
    }
    // emit the approval event
    emit(PigApprovalEvent{
        userAddress: msg.userAddress,
        referrerNftAddress: msg.referrerNftAddress,
        referrerAmount: msg.referrerAmount,
        userBountyHunters: msg.userBountyHunters,
        adminsShares: msg.adminsShares
      }.toCell()
    );
  }
}