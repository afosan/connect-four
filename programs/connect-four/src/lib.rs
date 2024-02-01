use anchor_lang::prelude::*;
use anchor_lang::solana_program::entrypoint::ProgramResult;

pub fn has_won(board: u64) -> bool {
    let directions: [u8; 4] = [1, 7, 6, 8];

    for d in directions {
        let bb = board & (board >> d);
        if bb & (bb >> (2 * d)) != 0 {
            return true;
        }
    }

    return false;
}

declare_id!("Hz8NQzqdznZBHQJKijt2XQi77E2PfqwNcmAwGn3bF7kY");

#[program]
pub mod connect_four {
    use super::*;

    pub fn create(ctx: Context<Create>) -> ProgramResult {
        let connect_four = &mut ctx.accounts.connect_four;
        connect_four.game_count = 0_u64;
        connect_four.top_row = 283691315109952_u64; // = (2^6  + 2^13 + 2^20 + 2^27 + 2^34 + 2^41 + 2^48)
        connect_four.initial_next_cell_index_by_column = [0, 7, 14, 21, 28, 35, 42];
        Ok(())
    }

    pub fn new_game_with_opponent(ctx: Context<CreateGameWithOpponent>, opponent: Pubkey) -> Result<()> {
        let connect_four = &mut ctx.accounts.connect_four;
        let game = &mut ctx.accounts.game;
        let player = &ctx.accounts.player;

        if *player.key == opponent {
            return err!(GameError::SamePlayers);
        }

        game.game_id = connect_four.game_count;
        game.player1 = player.key();
        game.player2 = opponent;
        game.next_cell_index_by_column = connect_four.initial_next_cell_index_by_column;
        game.board = [0_u64, 0_u64];
        game.move_count = 0_u8;
        game.status = GameStatus::Ongoing;

        connect_four.game_count += 1;

        Ok(())
    }

    pub fn make_move(ctx: Context<MakeMove>, column_index: u8) -> Result<()> {
        let connect_four = &mut ctx.accounts.connect_four;
        let game = &mut ctx.accounts.game;
        let player = &mut ctx.accounts.player;

        let column_index = column_index as usize;
        let next_player_index = (game.move_count & 1) as usize;
        let next_player = if next_player_index == 0 {
            game.player1
        } else {
            game.player2
        };

        if player.key() != next_player {
            return err!(GameError::NotPlayerTurn);
        }

        match game.status {
            GameStatus::Finished(_) => {
                return err!(GameError::GameAlreadyFinished);
            },
            _ => {},
        }

        if column_index >= 7 {
            return err!(GameError::InvalidColumnInput);
        }

        game.board[next_player_index] ^= (1 as u64) << game.next_cell_index_by_column[column_index];
        game.next_cell_index_by_column[column_index] += 1;

        if game.board[next_player_index] & connect_four.top_row != 0 {
            return err!(GameError::ColumnAlreadyFull);
        }

        if has_won(game.board[next_player_index]) {
            game.status = GameStatus::Finished(if next_player_index == 0 { GameResult::Player1Won } else { GameResult::Player2Won });
        }

        game.move_count += 1;

        if game.move_count == 42 {
            game.status = GameStatus::Finished(GameResult::Draw);
        }

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Create<'info> {
    #[account(
        init,
        payer=user,
        space=8 + 8 + 8 + 7 * 8,
    )]
    pub connect_four: Account<'info, ConnectFour>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}


#[derive(Accounts)]
pub struct CreateGameWithOpponent<'info> {
    #[account(mut)]
    pub connect_four: Account<'info, ConnectFour>,
    #[account(
        init,
        payer=player,
        seeds=[
            connect_four.to_account_info().key.as_ref(),
            connect_four.game_count.to_be_bytes().as_ref(),
        ],
        space=8 + 8 + 32 + 32 + 7 * 8 + 2 * 8 + 1 + (20), // not sure about exact space for (status: GameStatus)
        bump,
    )]
    pub game: Account<'info, Game>,
    #[account(mut)]
    pub player: Signer<'info>,
    system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MakeMove<'info> {
    #[account(mut)]
    pub connect_four: Account<'info, ConnectFour>,

    #[account(
        seeds = [
            connect_four.to_account_info().key.as_ref(),
            game.game_id.to_be_bytes().as_ref(),
        ],
        bump,
    )]
    #[account(mut)]
    pub game: Account<'info, Game>,
    #[account(mut)]
    pub player: Signer<'info>,
    system_program: Program<'info, System>,
}


#[account]
pub struct ConnectFour {
    game_count: u64,
    top_row: u64,
    initial_next_cell_index_by_column: [u64; 7],
}

#[account]
pub struct Game {
    pub game_id: u64,
    pub player1: Pubkey,
    pub player2: Pubkey,
    pub next_cell_index_by_column: [u64; 7],
    pub board: [u64; 2],
    pub move_count: u8,
    pub status: GameStatus,
}

#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone, PartialEq, Eq)]
pub enum GameResult {
    Player1Won,
    Player2Won,
    Draw,
}

#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone, PartialEq, Eq)]
pub enum GameStatus {
    Idle,
    Ongoing,
    Finished(GameResult),
}


#[error_code]
pub enum GameError {
    #[msg("Not player's turn")]
    NotPlayerTurn,
    #[msg("Game already finished")]
    GameAlreadyFinished,
    #[msg("Invalid column input")]
    InvalidColumnInput,
    #[msg("Invalid column input")]
    ColumnAlreadyFull,
    #[msg("Same players")]
    SamePlayers,
}
