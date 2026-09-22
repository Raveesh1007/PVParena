use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::state::Match;

/// Callers must debit the recorded deposit first; entitlements never derive from vault balance.
pub fn pay_out<'info>(
    match_account: &Account<'info, Match>,
    token_program: &Interface<'info, TokenInterface>,
    mint: &InterfaceAccount<'info, Mint>,
    vault: &InterfaceAccount<'info, TokenAccount>,
    destination: &InterfaceAccount<'info, TokenAccount>,
    amount: u64,
) -> Result<()> {
    let creator = match_account.creator;
    let nonce = match_account.match_nonce.to_le_bytes();
    let bump = [match_account.bump];
    let seeds: &[&[u8]] = &[b"match", creator.as_ref(), &nonce, &bump];

    transfer_checked(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            TransferChecked {
                from: vault.to_account_info(),
                mint: mint.to_account_info(),
                to: destination.to_account_info(),
                authority: match_account.to_account_info(),
            },
            &[seeds],
        ),
        amount,
        mint.decimals,
    )
}
