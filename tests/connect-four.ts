import * as anchor from "@coral-xyz/anchor";
import { ConnectFour } from "../target/types/connect_four";
import { assert, expect } from 'chai';

describe("connect-four", () => {
  const LAMPORTS_PER_SOL = 1_000_000_000;

  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  // Referencing the program - Abstraction that allows us to call methods of our SOL program
  const program = anchor.workspace.ConnectFour as anchor.Program<ConnectFour>;
  const provider = program.provider as anchor.AnchorProvider;

  // Generating a keypair for our ConnectFour account
  const connectFourDeployerPair = anchor.web3.Keypair.generate();
  const user1Pair = anchor.web3.Keypair.generate();
  const user2Pair = anchor.web3.Keypair.generate();
  const user3Pair = anchor.web3.Keypair.generate();
  const connectFourPair = anchor.web3.Keypair.generate();

  async function createGame(
    connectFour: anchor.web3.Keypair,
    player1: anchor.web3.Keypair,
    player2: anchor.web3.Keypair,
  ): Promise<anchor.web3.PublicKey> {
    let connectFourGameCount = (
      await program.account.connectFour.fetch(connectFour.publicKey)
    ).gameCount;

    const [gamePDA, bump] = await anchor.web3.PublicKey.findProgramAddress(
      [
        connectFour.publicKey.toBuffer(),
        connectFourGameCount.toArrayLike(Buffer, "be", 8),
      ],
      program.programId
    );

    const tx = await program.methods
      .newGameWithOpponent(player2.publicKey)
      .accounts({
        connectFour: connectFour.publicKey,
        game: gamePDA,
        player: player1.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([player1])
      .rpc();

    // await tx confirmation
    await program.provider.connection.confirmTransaction(tx);

    return gamePDA;
  }

  async function getGame(
    connectFour: anchor.web3.Keypair,
    gameId: string | number | anchor.BN,
  ): Promise<anchor.web3.PublicKey> {
    const [gamePDA, bump] = await anchor.web3.PublicKey.findProgramAddress(
      [
        connectFour.publicKey.toBuffer(),
        new anchor.BN(gameId).toArrayLike(Buffer, "be", 8),
      ],
      program.programId
    );

    return gamePDA;
  }

  async function makeMove(
    connectFour: anchor.web3.Keypair,
    game: anchor.web3.PublicKey | null = null,
    gameId: string | number | anchor.BN | null = null,
    player: anchor.web3.Keypair,
    column_index: number,
  ): Promise<anchor.web3.PublicKey> {
    if (game === null) {
      if (gameId === null) {
        throw new Error('either `game` or `gameId` has to be non-null');
      }
      game = await getGame(connectFour, gameId);
    }

    await program.methods
      .makeMove(column_index)
      .accounts({
        connectFour: connectFour.publicKey,
        game: game,
        player: player.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([player])
      .rpc();

    return game;
  }

  before(async () => {
    // Top up all acounts that will need lamports for account creation
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        connectFourDeployerPair.publicKey,
        2 * LAMPORTS_PER_SOL
      )
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        user1Pair.publicKey,
        2 * LAMPORTS_PER_SOL
      )
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        user2Pair.publicKey,
        2 * LAMPORTS_PER_SOL
      )
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        user3Pair.publicKey,
        2 * LAMPORTS_PER_SOL
      )
    );
    // await provider.connection.confirmTransaction(
    //   await provider.connection.requestAirdrop(
    //     connectFourPair.publicKey,
    //     2 * LAMPORTS_PER_SOL
    //   )
    // );
  });

  it("Create", async () => {
    // call create and deploy connectFour instance
    const tx = await program.methods
      .create()
      .accounts({
        connectFour: connectFourPair.publicKey,
        user: connectFourDeployerPair.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([connectFourDeployerPair, connectFourPair])
      .rpc();

    // await tx confirmation and print tx
    await program.provider.connection.confirmTransaction(tx);
    // console.log(`deployed ConnectFour instance [tx = ${tx}]`);

    // fetch account
    const connectFourInstance = await program.account.connectFour.fetch(connectFourPair.publicKey);
    // check field values
    expect(connectFourInstance.gameCount.toString()).to.equal(new anchor.BN(0).toString());
    expect(connectFourInstance.topRow.toString()).to.equal(new anchor.BN(283691315109952).toString());
    expect(connectFourInstance.initialNextCellIndexByColumn.map(v => v.toString())).deep.equal(
      [
        new anchor.BN(0),
        new anchor.BN(7),
        new anchor.BN(14),
        new anchor.BN(21),
        new anchor.BN(28),
        new anchor.BN(35),
        new anchor.BN(42),
      ].map(v => v.toString())
    );
  });

  it("CreateGameWithOpponent (gameId = 0)", async () => {
    const game0PDA = await createGame(connectFourPair, user1Pair, user2Pair);

    // fetch account
    const connectFourInstance = await program.account.connectFour.fetch(connectFourPair.publicKey);
    // check field values
    expect(connectFourInstance.gameCount.toString()).to.equal(new anchor.BN(1).toString());
    expect(connectFourInstance.topRow.toString()).to.equal(new anchor.BN(283691315109952).toString());
    expect(connectFourInstance.initialNextCellIndexByColumn.map(v => v.toString())).deep.equal(
      [
        new anchor.BN(0),
        new anchor.BN(7),
        new anchor.BN(14),
        new anchor.BN(21),
        new anchor.BN(28),
        new anchor.BN(35),
        new anchor.BN(42),
      ].map(v => v.toString())
    );

    const game1Instance = await program.account.game.fetch(game0PDA);
    expect(game1Instance.gameId.toString()).to.equal(new anchor.BN(0).toString());
    expect(game1Instance.player1.toString()).to.equal(user1Pair.publicKey.toString());
    expect(game1Instance.player2.toString()).to.equal(user2Pair.publicKey.toString());
    expect(game1Instance.nextCellIndexByColumn.map(v => v.toString())).deep.equal(
      [
        new anchor.BN(0),
        new anchor.BN(7),
        new anchor.BN(14),
        new anchor.BN(21),
        new anchor.BN(28),
        new anchor.BN(35),
        new anchor.BN(42),
      ].map(v => v.toString())
    );
    expect(game1Instance.board.map(v => v.toString())).deep.equal([new anchor.BN(0), new anchor.BN(0)].map(v => v.toString()));
    expect(game1Instance.moveCount).to.equal(0);
    expect(game1Instance.status).deep.equal({ ongoing: {} });
  });

  it("CreateGameWithOpponent (gameId = 1)", async () => {
    const game1PDA = await createGame(connectFourPair, user3Pair, user2Pair);

    // fetch account
    const connectFourInstance = await program.account.connectFour.fetch(connectFourPair.publicKey);
    // check field values
    expect(connectFourInstance.gameCount.toString()).to.equal(new anchor.BN(2).toString());
    expect(connectFourInstance.topRow.toString()).to.equal(new anchor.BN(283691315109952).toString());
    expect(connectFourInstance.initialNextCellIndexByColumn.map(v => v.toString())).deep.equal(
      [
        new anchor.BN(0),
        new anchor.BN(7),
        new anchor.BN(14),
        new anchor.BN(21),
        new anchor.BN(28),
        new anchor.BN(35),
        new anchor.BN(42),
      ].map(v => v.toString())
    );

    const game1Instance = await program.account.game.fetch(game1PDA);
    expect(game1Instance.gameId.toString()).to.equal(new anchor.BN(1).toString());
    expect(game1Instance.player1.toString()).to.equal(user3Pair.publicKey.toString());
    expect(game1Instance.player2.toString()).to.equal(user2Pair.publicKey.toString());
    expect(game1Instance.nextCellIndexByColumn.map(v => v.toString())).deep.equal(
      [
        new anchor.BN(0),
        new anchor.BN(7),
        new anchor.BN(14),
        new anchor.BN(21),
        new anchor.BN(28),
        new anchor.BN(35),
        new anchor.BN(42),
      ].map(v => v.toString())
    );
    expect(game1Instance.board.map(v => v.toString())).deep.equal([new anchor.BN(0), new anchor.BN(0)].map(v => v.toString()));
    expect(game1Instance.moveCount).to.equal(0);
    expect(game1Instance.status).deep.equal({ ongoing: {} });
  });

  it("CreateGameWithOpponent (error => SamePlayers)", async () => {
    try {
      await createGame(connectFourPair, user2Pair, user2Pair);
      assert(false, "should have failed");
    } catch (err) {
      expect(err.error.errorCode.code).to.equal("SamePlayers");
    }
  });

  it("MakeMove (gameId = 1)", async () => {
    const game1PDA = await makeMove(connectFourPair, null, 1, user3Pair, 0);

    let game1Instance = await program.account.game.fetch(game1PDA);
    expect(game1Instance.gameId.toString()).to.equal(new anchor.BN(1).toString());
    expect(game1Instance.player1.toString()).to.equal(user3Pair.publicKey.toString());
    expect(game1Instance.player2.toString()).to.equal(user2Pair.publicKey.toString());
    expect(game1Instance.nextCellIndexByColumn.map(v => v.toString())).deep.equal(
      [
        new anchor.BN(1),
        new anchor.BN(7),
        new anchor.BN(14),
        new anchor.BN(21),
        new anchor.BN(28),
        new anchor.BN(35),
        new anchor.BN(42),
      ].map(v => v.toString())
    );
    expect(game1Instance.board.map(v => v.toString())).deep.equal([new anchor.BN(1), new anchor.BN(0)].map(v => v.toString()));
    expect(game1Instance.moveCount).to.equal(1);
    expect(game1Instance.status).deep.equal({ ongoing: {} });

    try {
      await makeMove(connectFourPair, null, 1, user3Pair, 0);
      assert(false, "should have failed");
    } catch (err) {
      expect(err.error.errorCode.code).to.equal("NotPlayerTurn");
    }

    await makeMove(connectFourPair, null, 1, user2Pair, 0);

    game1Instance = await program.account.game.fetch(game1PDA);
    expect(game1Instance.gameId.toString()).to.equal(new anchor.BN(1).toString());
    expect(game1Instance.player1.toString()).to.equal(user3Pair.publicKey.toString());
    expect(game1Instance.player2.toString()).to.equal(user2Pair.publicKey.toString());
    expect(game1Instance.nextCellIndexByColumn.map(v => v.toString())).deep.equal(
      [
        new anchor.BN(2),
        new anchor.BN(7),
        new anchor.BN(14),
        new anchor.BN(21),
        new anchor.BN(28),
        new anchor.BN(35),
        new anchor.BN(42),
      ].map(v => v.toString())
    );
    expect(game1Instance.board.map(v => v.toString())).deep.equal([new anchor.BN(1), new anchor.BN(2)].map(v => v.toString()));
    expect(game1Instance.moveCount).to.equal(2);
    expect(game1Instance.status).deep.equal({ ongoing: {} });

    try {
      await makeMove(connectFourPair, null, 1, user3Pair, 7);
      assert(false, "should have failed");  
    } catch (err) {
      expect(err.error.errorCode.code).to.equal("InvalidColumnInput");
    }

    await makeMove(connectFourPair, null, 1, user3Pair, 0);
    await makeMove(connectFourPair, null, 1, user2Pair, 0);
    await makeMove(connectFourPair, null, 1, user3Pair, 0);
    await makeMove(connectFourPair, null, 1, user2Pair, 0);

    game1Instance = await program.account.game.fetch(game1PDA);
    expect(game1Instance.gameId.toString()).to.equal(new anchor.BN(1).toString());
    expect(game1Instance.player1.toString()).to.equal(user3Pair.publicKey.toString());
    expect(game1Instance.player2.toString()).to.equal(user2Pair.publicKey.toString());
    expect(game1Instance.nextCellIndexByColumn.map(v => v.toString())).deep.equal(
      [
        new anchor.BN(6),
        new anchor.BN(7),
        new anchor.BN(14),
        new anchor.BN(21),
        new anchor.BN(28),
        new anchor.BN(35),
        new anchor.BN(42),
      ].map(v => v.toString())
    );
    expect(game1Instance.board.map(v => v.toString())).deep.equal([new anchor.BN(21), new anchor.BN(42)].map(v => v.toString()));
    expect(game1Instance.moveCount).to.equal(6);
    expect(game1Instance.status).deep.equal({ ongoing: {} });

      try {
        await makeMove(connectFourPair, null, 1, user3Pair, 0);
        assert(false, "should have failed");
      } catch (err) {
        expect(err.error.errorCode.code).to.equal("ColumnAlreadyFull");
      }
  });

  it("MakeMove (gameId = 2)", async () => {
    const game2PDA = await createGame(connectFourPair, user1Pair, user2Pair);
    await makeMove(connectFourPair, game2PDA, null, user1Pair, 0);
    await makeMove(connectFourPair, game2PDA, null, user2Pair, 1);
    await makeMove(connectFourPair, game2PDA, null, user1Pair, 0);
    await makeMove(connectFourPair, game2PDA, null, user2Pair, 1);
    await makeMove(connectFourPair, game2PDA, null, user1Pair, 0);
    await makeMove(connectFourPair, game2PDA, null, user2Pair, 1);
    await makeMove(connectFourPair, game2PDA, null, user1Pair, 0);
  
    const game0Instance = await program.account.game.fetch(game2PDA);
    expect(game0Instance.gameId.toString()).to.equal(new anchor.BN(2).toString());
    expect(game0Instance.player1.toString()).to.equal(user1Pair.publicKey.toString());
    expect(game0Instance.player2.toString()).to.equal(user2Pair.publicKey.toString());
    expect(game0Instance.nextCellIndexByColumn.map(v => v.toString())).deep.equal(
      [
        new anchor.BN(4),
        new anchor.BN(10),
        new anchor.BN(14),
        new anchor.BN(21),
        new anchor.BN(28),
        new anchor.BN(35),
        new anchor.BN(42),
      ].map(v => v.toString())
    );
    expect(game0Instance.board.map(v => v.toString())).deep.equal([new anchor.BN(15), new anchor.BN(896)].map(v => v.toString()));
    expect(game0Instance.moveCount).to.equal(7);
    expect(game0Instance.status).deep.equal({ finished: { "0": { player1Won: {} } } });
  });

  it("MakeMove (gameId = 3)", async () => {
    const game3PDA = await createGame(connectFourPair, user2Pair, user3Pair);
    for (var column_index of [0, 1, 2]) {
      for (var i in [0, 1, 2]) {
        await makeMove(connectFourPair, game3PDA, null, user2Pair, column_index);
        await makeMove(connectFourPair, game3PDA, null, user3Pair, column_index);
      }
    }

    for (var column_index of [5, 6]) {
      for (var i in [0, 1, 2]) {
        await makeMove(connectFourPair, game3PDA, null, user2Pair, column_index);
        await makeMove(connectFourPair, game3PDA, null, user3Pair, column_index);
      }
    }

    await makeMove(connectFourPair, game3PDA, null, user2Pair, 4);
    await makeMove(connectFourPair, game3PDA, null, user3Pair, 3);
    await makeMove(connectFourPair, game3PDA, null, user2Pair, 3);
    await makeMove(connectFourPair, game3PDA, null, user3Pair, 4);
    await makeMove(connectFourPair, game3PDA, null, user2Pair, 4);
    await makeMove(connectFourPair, game3PDA, null, user3Pair, 3);
    await makeMove(connectFourPair, game3PDA, null, user2Pair, 3);
    await makeMove(connectFourPair, game3PDA, null, user3Pair, 4);
    await makeMove(connectFourPair, game3PDA, null, user2Pair, 4);
    await makeMove(connectFourPair, game3PDA, null, user3Pair, 3);
    await makeMove(connectFourPair, game3PDA, null, user2Pair, 3);
    await makeMove(connectFourPair, game3PDA, null, user3Pair, 4);

    const game3Instance = await program.account.game.fetch(game3PDA);
    expect(game3Instance.gameId.toString()).to.equal(new anchor.BN(3).toString());
    expect(game3Instance.player1.toString()).to.equal(user2Pair.publicKey.toString());
    expect(game3Instance.player2.toString()).to.equal(user3Pair.publicKey.toString());
    expect(game3Instance.nextCellIndexByColumn.map(v => v.toString())).deep.equal(
      [
        new anchor.BN(6),
        new anchor.BN(13),
        new anchor.BN(20),
        new anchor.BN(27),
        new anchor.BN(34),
        new anchor.BN(41),
        new anchor.BN(48),
      ].map(v => v.toString())
    );
    expect(game3Instance.board.map(v => v.toString())).deep.equal([new anchor.BN(93086256810645), new anchor.BN(186172381500714)].map(v => v.toString()));
    expect(game3Instance.moveCount).to.equal(42);
    expect(game3Instance.status).deep.equal({ finished: { "0": { draw: {} } } });
  });
});
