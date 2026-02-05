// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";

/**
 * @title OptiChannelSettlement
 * @notice Settlement contract for OptiChannel - gasless options trading via Yellow Network state channels
 * @dev Handles deposits, withdrawals, option settlements, and dispute resolution
 */
contract OptiChannelSettlement is ReentrancyGuard {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // ============================================================================
    // STATE VARIABLES
    // ============================================================================

    IERC20 public immutable usdc;
    IPyth public immutable pyth;
    bytes32 public immutable ethUsdPriceId;

    // Challenge period for disputes (24 hours default)
    uint256 public constant CHALLENGE_PERIOD = 24 hours;

    // Minimum deposit amount (10 USDC with 6 decimals)
    uint256 public constant MIN_DEPOSIT = 10 * 1e6;

    // User balances (available for trading)
    mapping(address => uint256) public balances;

    // User withdrawal nonces (prevents replay)
    mapping(address => uint256) public withdrawalNonces;

    // Option states
    mapping(bytes32 => Option) public options;

    // State channel commitments
    mapping(bytes32 => ChannelState) public channels;

    // Pending settlements (for dispute resolution)
    mapping(bytes32 => PendingSettlement) public pendingSettlements;

    // ============================================================================
    // STRUCTS
    // ============================================================================

    struct Option {
        bytes32 id;
        address writer;          // Seller of the option
        address holder;          // Buyer of the option (0x0 if not sold)
        uint256 strikePrice;     // Strike price (8 decimals)
        uint256 premium;         // Premium paid (6 decimals, USDC)
        uint256 amount;          // ETH amount (18 decimals)
        uint256 expiry;          // Expiration timestamp
        bool isCall;             // true = call, false = put
        OptionStatus status;
    }

    enum OptionStatus {
        Open,       // Listed, not yet sold
        Active,     // Sold, waiting for expiry
        Exercised,  // Holder exercised the option
        Expired,    // Expired worthless
        Cancelled   // Cancelled by writer before sale
    }

    struct ChannelState {
        bytes32 channelId;
        address partyA;
        address partyB;
        uint256 balanceA;
        uint256 balanceB;
        uint256 nonce;
        uint256 challengeExpiry;  // 0 if not challenged
        bool finalized;
    }

    struct PendingSettlement {
        bytes32 optionId;
        uint256 settlementPrice;  // Price from Pyth at exercise time
        uint256 payout;           // Calculated payout
        address winner;           // Who receives payout
        uint256 challengeExpiry;  // When challenge period ends
        bool finalized;
    }

    // ============================================================================
    // EVENTS
    // ============================================================================

    event Deposited(address indexed user, uint256 amount, uint256 newBalance);
    event Withdrawn(address indexed user, uint256 amount, uint256 newBalance);
    event OptionCreated(bytes32 indexed optionId, address indexed writer, uint256 strike, bool isCall);
    event OptionPurchased(bytes32 indexed optionId, address indexed holder, uint256 premium);
    event OptionExercised(bytes32 indexed optionId, address indexed holder, uint256 settlementPrice, uint256 payout);
    event OptionExpired(bytes32 indexed optionId);
    event OptionCancelled(bytes32 indexed optionId);
    event SettlementInitiated(bytes32 indexed optionId, uint256 settlementPrice, uint256 payout, uint256 challengeExpiry);
    event SettlementFinalized(bytes32 indexed optionId, address indexed winner, uint256 payout);
    event SettlementDisputed(bytes32 indexed optionId, address indexed disputer);
    event ChannelOpened(bytes32 indexed channelId, address partyA, address partyB);
    event ChannelUpdated(bytes32 indexed channelId, uint256 nonce, uint256 balanceA, uint256 balanceB);
    event ChannelChallenged(bytes32 indexed channelId, address challenger, uint256 challengeExpiry);
    event ChannelFinalized(bytes32 indexed channelId);

    // ============================================================================
    // ERRORS
    // ============================================================================

    error InsufficientBalance();
    error InvalidSignature();
    error InvalidNonce();
    error OptionNotFound();
    error OptionNotActive();
    error OptionNotExpired();
    error OptionAlreadyExpired();
    error NotOptionHolder();
    error NotOptionWriter();
    error ChallengePeriodActive();
    error ChallengePeriodExpired();
    error ChannelNotFound();
    error ChannelAlreadyFinalized();
    error InvalidChannelState();
    error UnauthorizedParty();
    error SettlementNotFound();
    error SettlementAlreadyFinalized();
    error AmountTooLow();
    error PythPriceStale();

    // ============================================================================
    // CONSTRUCTOR
    // ============================================================================

    /**
     * @param _usdc USDC token address
     * @param _pyth Pyth oracle contract address
     * @param _ethUsdPriceId Pyth price feed ID for ETH/USD
     */
    constructor(address _usdc, address _pyth, bytes32 _ethUsdPriceId) {
        usdc = IERC20(_usdc);
        pyth = IPyth(_pyth);
        ethUsdPriceId = _ethUsdPriceId;
    }

    // ============================================================================
    // DEPOSIT / WITHDRAWAL
    // ============================================================================

    /**
     * @notice Deposit USDC into the protocol
     * @param amount Amount of USDC to deposit (6 decimals)
     */
    function deposit(uint256 amount) external nonReentrant {
        if (amount < MIN_DEPOSIT) revert AmountTooLow();

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        balances[msg.sender] += amount;

        emit Deposited(msg.sender, amount, balances[msg.sender]);
    }

    /**
     * @notice Withdraw USDC with signature authorization
     * @dev Used for state channel withdrawals - requires signature from user
     * @param amount Amount to withdraw
     * @param nonce Withdrawal nonce (must match current nonce)
     * @param signature User's signature authorizing withdrawal
     */
    function withdraw(
        uint256 amount,
        uint256 nonce,
        bytes calldata signature
    ) external nonReentrant {
        if (balances[msg.sender] < amount) revert InsufficientBalance();
        if (nonce != withdrawalNonces[msg.sender]) revert InvalidNonce();

        // Verify signature
        bytes32 messageHash = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            keccak256(abi.encodePacked(msg.sender, amount, nonce, block.chainid, address(this)))
        ));

        address signer = messageHash.recover(signature);
        if (signer != msg.sender) revert InvalidSignature();

        withdrawalNonces[msg.sender]++;
        balances[msg.sender] -= amount;
        usdc.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount, balances[msg.sender]);
    }

    /**
     * @notice Direct withdrawal without signature (for simple cases)
     * @param amount Amount to withdraw
     */
    function withdrawDirect(uint256 amount) external nonReentrant {
        if (balances[msg.sender] < amount) revert InsufficientBalance();

        balances[msg.sender] -= amount;
        usdc.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount, balances[msg.sender]);
    }

    // ============================================================================
    // OPTION LIFECYCLE
    // ============================================================================

    /**
     * @notice Create a new option (writer lists for sale)
     * @param strikePrice Strike price in 8 decimals
     * @param premium Premium amount in USDC (6 decimals)
     * @param amount ETH amount in 18 decimals
     * @param expiry Expiration timestamp
     * @param isCall true for call option, false for put
     */
    function createOption(
        uint256 strikePrice,
        uint256 premium,
        uint256 amount,
        uint256 expiry,
        bool isCall
    ) external nonReentrant returns (bytes32 optionId) {
        // Calculate required collateral
        uint256 collateral = calculateCollateral(strikePrice, amount, isCall);
        if (balances[msg.sender] < collateral) revert InsufficientBalance();

        // Lock collateral
        balances[msg.sender] -= collateral;

        // Generate option ID
        optionId = keccak256(abi.encodePacked(
            msg.sender,
            strikePrice,
            premium,
            amount,
            expiry,
            isCall,
            block.timestamp
        ));

        options[optionId] = Option({
            id: optionId,
            writer: msg.sender,
            holder: address(0),
            strikePrice: strikePrice,
            premium: premium,
            amount: amount,
            expiry: expiry,
            isCall: isCall,
            status: OptionStatus.Open
        });

        emit OptionCreated(optionId, msg.sender, strikePrice, isCall);
    }

    /**
     * @notice Purchase an open option
     * @param optionId ID of the option to purchase
     */
    function purchaseOption(bytes32 optionId) external nonReentrant {
        Option storage option = options[optionId];
        if (option.writer == address(0)) revert OptionNotFound();
        if (option.status != OptionStatus.Open) revert OptionNotActive();
        if (block.timestamp >= option.expiry) revert OptionAlreadyExpired();
        if (balances[msg.sender] < option.premium) revert InsufficientBalance();

        // Transfer premium from buyer to writer
        balances[msg.sender] -= option.premium;
        balances[option.writer] += option.premium;

        // Update option state
        option.holder = msg.sender;
        option.status = OptionStatus.Active;

        emit OptionPurchased(optionId, msg.sender, option.premium);
    }

    /**
     * @notice Exercise an option at expiry
     * @param optionId ID of the option to exercise
     * @param pythPriceUpdate Pyth price update data
     */
    function exerciseOption(
        bytes32 optionId,
        bytes[] calldata pythPriceUpdate
    ) external payable nonReentrant {
        Option storage option = options[optionId];
        if (option.writer == address(0)) revert OptionNotFound();
        if (option.status != OptionStatus.Active) revert OptionNotActive();
        if (msg.sender != option.holder) revert NotOptionHolder();
        if (block.timestamp < option.expiry) revert OptionNotExpired();

        // Update Pyth price
        uint256 pythFee = pyth.getUpdateFee(pythPriceUpdate);
        pyth.updatePriceFeeds{value: pythFee}(pythPriceUpdate);

        // Get settlement price
        PythStructs.Price memory price = pyth.getPriceNoOlderThan(ethUsdPriceId, 60);
        if (price.publishTime < block.timestamp - 300) revert PythPriceStale();

        // Convert Pyth price to 8 decimals (Pyth uses variable exponent)
        uint256 settlementPrice = uint256(uint64(price.price));
        if (price.expo < -8) {
            settlementPrice = settlementPrice / (10 ** uint32(-price.expo - 8));
        } else if (price.expo > -8) {
            settlementPrice = settlementPrice * (10 ** uint32(-8 - price.expo));
        }

        // Calculate payout
        uint256 payout = calculatePayout(option, settlementPrice);

        // Initiate settlement with challenge period
        bytes32 settlementId = keccak256(abi.encodePacked(optionId, block.timestamp));
        pendingSettlements[optionId] = PendingSettlement({
            optionId: optionId,
            settlementPrice: settlementPrice,
            payout: payout,
            winner: payout > 0 ? option.holder : option.writer,
            challengeExpiry: block.timestamp + CHALLENGE_PERIOD,
            finalized: false
        });

        option.status = OptionStatus.Exercised;

        emit SettlementInitiated(optionId, settlementPrice, payout, block.timestamp + CHALLENGE_PERIOD);

        // Refund excess ETH
        if (msg.value > pythFee) {
            payable(msg.sender).transfer(msg.value - pythFee);
        }
    }

    /**
     * @notice Finalize a settlement after challenge period
     * @param optionId ID of the option to finalize
     */
    function finalizeSettlement(bytes32 optionId) external nonReentrant {
        PendingSettlement storage settlement = pendingSettlements[optionId];
        if (settlement.optionId == bytes32(0)) revert SettlementNotFound();
        if (settlement.finalized) revert SettlementAlreadyFinalized();
        if (block.timestamp < settlement.challengeExpiry) revert ChallengePeriodActive();

        Option storage option = options[optionId];

        // Calculate collateral that was locked
        uint256 collateral = calculateCollateral(option.strikePrice, option.amount, option.isCall);

        // Distribute funds
        if (settlement.payout > 0) {
            // Option was in the money - pay holder
            balances[option.holder] += settlement.payout;
            // Return remaining collateral to writer
            if (collateral > settlement.payout) {
                balances[option.writer] += (collateral - settlement.payout);
            }
        } else {
            // Option expired worthless - return collateral to writer
            balances[option.writer] += collateral;
        }

        settlement.finalized = true;

        emit SettlementFinalized(optionId, settlement.winner, settlement.payout);
    }

    /**
     * @notice Dispute a pending settlement
     * @param optionId ID of the option to dispute
     * @param pythPriceUpdate New Pyth price update as evidence
     */
    function disputeSettlement(
        bytes32 optionId,
        bytes[] calldata pythPriceUpdate
    ) external payable nonReentrant {
        PendingSettlement storage settlement = pendingSettlements[optionId];
        if (settlement.optionId == bytes32(0)) revert SettlementNotFound();
        if (settlement.finalized) revert SettlementAlreadyFinalized();
        if (block.timestamp >= settlement.challengeExpiry) revert ChallengePeriodExpired();

        Option storage option = options[optionId];
        if (msg.sender != option.writer && msg.sender != option.holder) revert UnauthorizedParty();

        // Update Pyth price
        uint256 pythFee = pyth.getUpdateFee(pythPriceUpdate);
        pyth.updatePriceFeeds{value: pythFee}(pythPriceUpdate);

        // Get new price
        PythStructs.Price memory price = pyth.getPriceNoOlderThan(ethUsdPriceId, 60);
        uint256 newSettlementPrice = uint256(uint64(price.price));
        if (price.expo < -8) {
            newSettlementPrice = newSettlementPrice / (10 ** uint32(-price.expo - 8));
        } else if (price.expo > -8) {
            newSettlementPrice = newSettlementPrice * (10 ** uint32(-8 - price.expo));
        }

        // Recalculate payout
        uint256 newPayout = calculatePayout(option, newSettlementPrice);

        // Update settlement
        settlement.settlementPrice = newSettlementPrice;
        settlement.payout = newPayout;
        settlement.winner = newPayout > 0 ? option.holder : option.writer;
        settlement.challengeExpiry = block.timestamp + CHALLENGE_PERIOD;

        emit SettlementDisputed(optionId, msg.sender);
        emit SettlementInitiated(optionId, newSettlementPrice, newPayout, settlement.challengeExpiry);

        // Refund excess ETH
        if (msg.value > pythFee) {
            payable(msg.sender).transfer(msg.value - pythFee);
        }
    }

    /**
     * @notice Mark an option as expired (worthless)
     * @param optionId ID of the option
     */
    function expireOption(bytes32 optionId) external nonReentrant {
        Option storage option = options[optionId];
        if (option.writer == address(0)) revert OptionNotFound();
        if (option.status != OptionStatus.Active) revert OptionNotActive();
        if (block.timestamp < option.expiry) revert OptionNotExpired();

        // Return collateral to writer
        uint256 collateral = calculateCollateral(option.strikePrice, option.amount, option.isCall);
        balances[option.writer] += collateral;

        option.status = OptionStatus.Expired;

        emit OptionExpired(optionId);
    }

    /**
     * @notice Cancel an unsold option
     * @param optionId ID of the option
     */
    function cancelOption(bytes32 optionId) external nonReentrant {
        Option storage option = options[optionId];
        if (option.writer == address(0)) revert OptionNotFound();
        if (msg.sender != option.writer) revert NotOptionWriter();
        if (option.status != OptionStatus.Open) revert OptionNotActive();

        // Return collateral
        uint256 collateral = calculateCollateral(option.strikePrice, option.amount, option.isCall);
        balances[option.writer] += collateral;

        option.status = OptionStatus.Cancelled;

        emit OptionCancelled(optionId);
    }

    // ============================================================================
    // STATE CHANNEL INTEGRATION
    // ============================================================================

    /**
     * @notice Open a state channel between two parties
     * @param partyB The other party in the channel
     * @param initialBalanceA Initial balance for party A (msg.sender)
     * @param initialBalanceB Initial balance for party B
     */
    function openChannel(
        address partyB,
        uint256 initialBalanceA,
        uint256 initialBalanceB
    ) external nonReentrant returns (bytes32 channelId) {
        if (balances[msg.sender] < initialBalanceA) revert InsufficientBalance();
        if (balances[partyB] < initialBalanceB) revert InsufficientBalance();

        // Lock funds
        balances[msg.sender] -= initialBalanceA;
        balances[partyB] -= initialBalanceB;

        channelId = keccak256(abi.encodePacked(msg.sender, partyB, block.timestamp));

        channels[channelId] = ChannelState({
            channelId: channelId,
            partyA: msg.sender,
            partyB: partyB,
            balanceA: initialBalanceA,
            balanceB: initialBalanceB,
            nonce: 0,
            challengeExpiry: 0,
            finalized: false
        });

        emit ChannelOpened(channelId, msg.sender, partyB);
    }

    /**
     * @notice Submit a state update with both signatures
     * @param channelId Channel to update
     * @param newBalanceA New balance for party A
     * @param newBalanceB New balance for party B
     * @param nonce State nonce (must be higher than current)
     * @param sigA Signature from party A
     * @param sigB Signature from party B
     */
    function updateChannelState(
        bytes32 channelId,
        uint256 newBalanceA,
        uint256 newBalanceB,
        uint256 nonce,
        bytes calldata sigA,
        bytes calldata sigB
    ) external nonReentrant {
        ChannelState storage channel = channels[channelId];
        if (channel.partyA == address(0)) revert ChannelNotFound();
        if (channel.finalized) revert ChannelAlreadyFinalized();
        if (nonce <= channel.nonce) revert InvalidNonce();

        // Verify state is balanced (no funds created/destroyed)
        uint256 totalBefore = channel.balanceA + channel.balanceB;
        uint256 totalAfter = newBalanceA + newBalanceB;
        if (totalBefore != totalAfter) revert InvalidChannelState();

        // Verify signatures
        bytes32 stateHash = keccak256(abi.encodePacked(
            channelId, newBalanceA, newBalanceB, nonce, block.chainid
        ));
        bytes32 ethSignedHash = stateHash.toEthSignedMessageHash();

        if (ethSignedHash.recover(sigA) != channel.partyA) revert InvalidSignature();
        if (ethSignedHash.recover(sigB) != channel.partyB) revert InvalidSignature();

        // Update state
        channel.balanceA = newBalanceA;
        channel.balanceB = newBalanceB;
        channel.nonce = nonce;

        emit ChannelUpdated(channelId, nonce, newBalanceA, newBalanceB);
    }

    /**
     * @notice Challenge a channel state (start dispute)
     * @param channelId Channel to challenge
     */
    function challengeChannel(bytes32 channelId) external nonReentrant {
        ChannelState storage channel = channels[channelId];
        if (channel.partyA == address(0)) revert ChannelNotFound();
        if (channel.finalized) revert ChannelAlreadyFinalized();
        if (msg.sender != channel.partyA && msg.sender != channel.partyB) revert UnauthorizedParty();

        channel.challengeExpiry = block.timestamp + CHALLENGE_PERIOD;

        emit ChannelChallenged(channelId, msg.sender, channel.challengeExpiry);
    }

    /**
     * @notice Finalize a channel after challenge period
     * @param channelId Channel to finalize
     */
    function finalizeChannel(bytes32 channelId) external nonReentrant {
        ChannelState storage channel = channels[channelId];
        if (channel.partyA == address(0)) revert ChannelNotFound();
        if (channel.finalized) revert ChannelAlreadyFinalized();
        if (channel.challengeExpiry == 0) revert ChallengePeriodActive();
        if (block.timestamp < channel.challengeExpiry) revert ChallengePeriodActive();

        // Return funds to parties
        balances[channel.partyA] += channel.balanceA;
        balances[channel.partyB] += channel.balanceB;

        channel.finalized = true;

        emit ChannelFinalized(channelId);
    }

    // ============================================================================
    // VIEW FUNCTIONS
    // ============================================================================

    /**
     * @notice Get user's available balance
     */
    function getBalance(address user) external view returns (uint256) {
        return balances[user];
    }

    /**
     * @notice Get option details
     */
    function getOption(bytes32 optionId) external view returns (Option memory) {
        return options[optionId];
    }

    /**
     * @notice Get channel state
     */
    function getChannel(bytes32 channelId) external view returns (ChannelState memory) {
        return channels[channelId];
    }

    /**
     * @notice Get pending settlement details
     */
    function getPendingSettlement(bytes32 optionId) external view returns (PendingSettlement memory) {
        return pendingSettlements[optionId];
    }

    /**
     * @notice Calculate required collateral for an option
     * @dev For calls: max loss is (amount * currentPrice) - limited by premium received
     * @dev For puts: max loss is (amount * strikePrice)
     */
    function calculateCollateral(
        uint256 strikePrice,
        uint256 amount,
        bool isCall
    ) public pure returns (uint256) {
        if (isCall) {
            // Call writer needs to cover potential upside
            // Collateral = amount * strike (conservative estimate)
            // Amount is 18 decimals, strike is 8 decimals, USDC is 6 decimals
            // (amount * strike) / 1e18 / 1e8 * 1e6 = (amount * strike) / 1e20
            return (amount * strikePrice) / 1e20;
        } else {
            // Put writer needs to cover strike price
            // If price goes to 0, holder can sell at strike
            return (amount * strikePrice) / 1e20;
        }
    }

    /**
     * @notice Calculate payout for an exercised option
     */
    function calculatePayout(
        Option memory option,
        uint256 settlementPrice
    ) public pure returns (uint256) {
        if (option.isCall) {
            // Call: profit if price > strike
            if (settlementPrice > option.strikePrice) {
                // Payout = (settlementPrice - strike) * amount
                // Convert to USDC (6 decimals)
                return ((settlementPrice - option.strikePrice) * option.amount) / 1e20;
            }
        } else {
            // Put: profit if price < strike
            if (settlementPrice < option.strikePrice) {
                // Payout = (strike - settlementPrice) * amount
                return ((option.strikePrice - settlementPrice) * option.amount) / 1e20;
            }
        }
        return 0;
    }

    /**
     * @notice Get current ETH/USD price from Pyth
     */
    function getEthUsdPrice() external view returns (uint256 price, uint256 confidence) {
        PythStructs.Price memory pythPrice = pyth.getPriceUnsafe(ethUsdPriceId);
        price = uint256(uint64(pythPrice.price));
        confidence = uint256(pythPrice.conf);

        // Normalize to 8 decimals
        if (pythPrice.expo < -8) {
            price = price / (10 ** uint32(-pythPrice.expo - 8));
            confidence = confidence / (10 ** uint32(-pythPrice.expo - 8));
        } else if (pythPrice.expo > -8) {
            price = price * (10 ** uint32(-8 - pythPrice.expo));
            confidence = confidence * (10 ** uint32(-8 - pythPrice.expo));
        }
    }

    // ============================================================================
    // ADMIN FUNCTIONS
    // ============================================================================

    /**
     * @notice Emergency function to recover stuck ETH
     */
    receive() external payable {}

    /**
     * @notice Withdraw ETH sent for Pyth updates
     */
    function withdrawEth() external {
        payable(msg.sender).transfer(address(this).balance);
    }
}
