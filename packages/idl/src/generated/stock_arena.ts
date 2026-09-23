/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/stock_arena.json`.
 */
export type StockArena = {
  address: '8xYafVKnRmi99cRPQV2TLRHRH2MsfjZtJH4DMy8anHiC';
  metadata: {
    name: 'stockArena';
    version: '0.1.0';
    spec: '0.1.0';
    description: 'Stock Arena: two-player PvP market-prediction escrow and settlement';
  };
  instructions: [
    {
      name: 'activateMatch';
      discriminator: [82, 251, 107, 158, 107, 253, 178, 183];
      accounts: [
        {
          name: 'orchestrator';
          docs: [
            'Only the configured orchestrator may start the clock, because activation fixes the start',
            'price every later score is measured against.',
          ];
          signer: true;
        },
        {
          name: 'config';
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: 'arena';
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [97, 114, 101, 110, 97];
              },
              {
                kind: 'account';
                path: 'arena.asset_mint';
                account: 'arena';
              },
              {
                kind: 'account';
                path: 'arena.benchmark_feed_id';
                account: 'arena';
              },
            ];
          };
          relations: ['matchAccount'];
        },
        {
          name: 'matchAccount';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [109, 97, 116, 99, 104];
              },
              {
                kind: 'account';
                path: 'match_account.creator';
                account: 'match';
              },
              {
                kind: 'account';
                path: 'match_account.match_nonce';
                account: 'match';
              },
            ];
          };
        },
        {
          name: 'priceUpdate';
          docs: [
            'Owned by the Pyth receiver program; the `Account` wrapper enforces that. The worker posts',
            'this immediately before calling, and may close it afterwards to reclaim rent.',
          ];
        },
      ];
      args: [];
    },
    {
      name: 'cancelOpenMatch';
      discriminator: [192, 131, 177, 134, 19, 118, 55, 9];
      accounts: [
        {
          name: 'creator';
          writable: true;
          signer: true;
        },
        {
          name: 'arena';
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [97, 114, 101, 110, 97];
              },
              {
                kind: 'account';
                path: 'arena.asset_mint';
                account: 'arena';
              },
              {
                kind: 'account';
                path: 'arena.benchmark_feed_id';
                account: 'arena';
              },
            ];
          };
          relations: ['matchAccount'];
        },
        {
          name: 'matchAccount';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [109, 97, 116, 99, 104];
              },
              {
                kind: 'account';
                path: 'match_account.creator';
                account: 'match';
              },
              {
                kind: 'account';
                path: 'match_account.match_nonce';
                account: 'match';
              },
            ];
          };
        },
        {
          name: 'assetMint';
        },
        {
          name: 'creatorAssetAccount';
          writable: true;
        },
        {
          name: 'vault';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'account';
                path: 'matchAccount';
              },
              {
                kind: 'account';
                path: 'assetTokenProgram';
              },
              {
                kind: 'account';
                path: 'assetMint';
              },
            ];
            program: {
              kind: 'const';
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89,
              ];
            };
          };
        },
        {
          name: 'assetTokenProgram';
        },
      ];
      args: [];
    },
    {
      name: 'claimWinnerStake';
      discriminator: [170, 37, 219, 25, 237, 88, 56, 237];
      accounts: [
        {
          name: 'winner';
          writable: true;
          signer: true;
        },
        {
          name: 'arena';
          docs: ["The winner's own stake Arena; checked in the handler."];
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [97, 114, 101, 110, 97];
              },
              {
                kind: 'account';
                path: 'arena.asset_mint';
                account: 'arena';
              },
              {
                kind: 'account';
                path: 'arena.benchmark_feed_id';
                account: 'arena';
              },
            ];
          };
        },
        {
          name: 'matchAccount';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [109, 97, 116, 99, 104];
              },
              {
                kind: 'account';
                path: 'match_account.creator';
                account: 'match';
              },
              {
                kind: 'account';
                path: 'match_account.match_nonce';
                account: 'match';
              },
            ];
          };
        },
        {
          name: 'assetMint';
        },
        {
          name: 'winnerAssetAccount';
          writable: true;
        },
        {
          name: 'vault';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'account';
                path: 'matchAccount';
              },
              {
                kind: 'account';
                path: 'assetTokenProgram';
              },
              {
                kind: 'account';
                path: 'assetMint';
              },
            ];
            program: {
              kind: 'const';
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89,
              ];
            };
          };
        },
        {
          name: 'assetTokenProgram';
        },
      ];
      args: [];
    },
    {
      name: 'createArena';
      discriminator: [174, 236, 45, 61, 197, 215, 149, 169];
      accounts: [
        {
          name: 'admin';
          writable: true;
          signer: true;
          relations: ['config'];
        },
        {
          name: 'config';
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: 'arena';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [97, 114, 101, 110, 97];
              },
              {
                kind: 'account';
                path: 'assetMint';
              },
              {
                kind: 'arg';
                path: 'params.benchmark_feed_id';
              },
            ];
          };
        },
        {
          name: 'assetMint';
          docs: ['Devnet test copy of the PreStocks asset.'];
        },
        {
          name: 'quoteMint';
        },
        {
          name: 'systemProgram';
          address: '11111111111111111111111111111111';
        },
      ];
      args: [
        {
          name: 'params';
          type: {
            defined: {
              name: 'arenaParams';
            };
          };
        },
      ];
    },
    {
      name: 'createMatch';
      discriminator: [107, 2, 184, 145, 70, 142, 17, 165];
      accounts: [
        {
          name: 'creator';
          writable: true;
          signer: true;
        },
        {
          name: 'config';
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: 'arena';
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [97, 114, 101, 110, 97];
              },
              {
                kind: 'account';
                path: 'arena.asset_mint';
                account: 'arena';
              },
              {
                kind: 'account';
                path: 'arena.benchmark_feed_id';
                account: 'arena';
              },
            ];
          };
        },
        {
          name: 'challengerArena';
          docs: ['May be `arena` itself for a same-token duel.'];
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [97, 114, 101, 110, 97];
              },
              {
                kind: 'account';
                path: 'challenger_arena.asset_mint';
                account: 'arena';
              },
              {
                kind: 'account';
                path: 'challenger_arena.benchmark_feed_id';
                account: 'arena';
              },
            ];
          };
        },
        {
          name: 'matchAccount';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [109, 97, 116, 99, 104];
              },
              {
                kind: 'account';
                path: 'creator';
              },
              {
                kind: 'arg';
                path: 'matchNonce';
              },
            ];
          };
        },
        {
          name: 'assetMint';
        },
        {
          name: 'challengerAssetMint';
          docs: [
            "Read only for its decimals, to apply the minimum stake to the challenger's side.",
          ];
        },
        {
          name: 'creatorAssetAccount';
          writable: true;
        },
        {
          name: 'vault';
          docs: [
            "One vault per staked mint: that mint's ATA owned by the Match PDA. A same-token duel shares",
            'it, which is safe because payouts follow recorded deposits. `code.md` §7.1.',
          ];
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'account';
                path: 'matchAccount';
              },
              {
                kind: 'account';
                path: 'assetTokenProgram';
              },
              {
                kind: 'account';
                path: 'assetMint';
              },
            ];
            program: {
              kind: 'const';
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89,
              ];
            };
          };
        },
        {
          name: 'assetTokenProgram';
        },
        {
          name: 'associatedTokenProgram';
          address: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
        },
        {
          name: 'systemProgram';
          address: '11111111111111111111111111111111';
        },
      ];
      args: [
        {
          name: 'matchNonce';
          type: 'u64';
        },
        {
          name: 'terms';
          type: {
            defined: {
              name: 'matchTerms';
            };
          };
        },
        {
          name: 'strategyCommitment';
          type: {
            array: ['u8', 32];
          };
        },
      ];
    },
    {
      name: 'exerciseOption';
      discriminator: [231, 98, 131, 183, 245, 93, 122, 48];
      accounts: [
        {
          name: 'winner';
          writable: true;
          signer: true;
        },
        {
          name: 'loser';
          docs: ["against the match's recorded loser in the handler. It is never read or written."];
        },
        {
          name: 'arena';
          docs: [
            "The loser's stake Arena: its asset is what changes hands. Checked in the handler.",
          ];
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [97, 114, 101, 110, 97];
              },
              {
                kind: 'account';
                path: 'arena.asset_mint';
                account: 'arena';
              },
              {
                kind: 'account';
                path: 'arena.benchmark_feed_id';
                account: 'arena';
              },
            ];
          };
        },
        {
          name: 'matchAccount';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [109, 97, 116, 99, 104];
              },
              {
                kind: 'account';
                path: 'match_account.creator';
                account: 'match';
              },
              {
                kind: 'account';
                path: 'match_account.match_nonce';
                account: 'match';
              },
            ];
          };
        },
        {
          name: 'assetMint';
        },
        {
          name: 'quoteMint';
        },
        {
          name: 'winnerAssetAccount';
          docs: ["In a cross-token duel the winner may never have held the loser's asset."];
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'account';
                path: 'winner';
              },
              {
                kind: 'account';
                path: 'assetTokenProgram';
              },
              {
                kind: 'account';
                path: 'assetMint';
              },
            ];
            program: {
              kind: 'const';
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89,
              ];
            };
          };
        },
        {
          name: 'winnerQuoteAccount';
          writable: true;
        },
        {
          name: 'loserQuoteAccount';
          docs: [
            'There is no persistent quote vault: the strike moves straight from winner to loser.',
            '`init_if_needed` so a loser who has never held the quote asset can still be paid, with the',
            'winner covering the rent as the party choosing to exercise. `code.md` §7.1.',
          ];
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'account';
                path: 'loser';
              },
              {
                kind: 'account';
                path: 'quoteTokenProgram';
              },
              {
                kind: 'account';
                path: 'quoteMint';
              },
            ];
            program: {
              kind: 'const';
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89,
              ];
            };
          };
        },
        {
          name: 'vault';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'account';
                path: 'matchAccount';
              },
              {
                kind: 'account';
                path: 'assetTokenProgram';
              },
              {
                kind: 'account';
                path: 'assetMint';
              },
            ];
            program: {
              kind: 'const';
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89,
              ];
            };
          };
        },
        {
          name: 'assetTokenProgram';
        },
        {
          name: 'quoteTokenProgram';
        },
        {
          name: 'associatedTokenProgram';
          address: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
        },
        {
          name: 'systemProgram';
          address: '11111111111111111111111111111111';
        },
      ];
      args: [];
    },
    {
      name: 'initializeProtocol';
      discriminator: [188, 233, 252, 106, 134, 146, 202, 91];
      accounts: [
        {
          name: 'admin';
          writable: true;
          signer: true;
        },
        {
          name: 'config';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: 'systemProgram';
          address: '11111111111111111111111111111111';
        },
      ];
      args: [
        {
          name: 'params';
          type: {
            defined: {
              name: 'protocolParams';
            };
          };
        },
      ];
    },
    {
      name: 'joinMatch';
      discriminator: [244, 8, 47, 130, 192, 59, 179, 44];
      accounts: [
        {
          name: 'challenger';
          writable: true;
          signer: true;
        },
        {
          name: 'config';
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: 'arena';
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [97, 114, 101, 110, 97];
              },
              {
                kind: 'account';
                path: 'arena.asset_mint';
                account: 'arena';
              },
              {
                kind: 'account';
                path: 'arena.benchmark_feed_id';
                account: 'arena';
              },
            ];
          };
          relations: ['matchAccount'];
        },
        {
          name: 'challengerArena';
        },
        {
          name: 'matchAccount';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [109, 97, 116, 99, 104];
              },
              {
                kind: 'account';
                path: 'match_account.creator';
                account: 'match';
              },
              {
                kind: 'account';
                path: 'match_account.match_nonce';
                account: 'match';
              },
            ];
          };
        },
        {
          name: 'assetMint';
        },
        {
          name: 'challengerAssetAccount';
          writable: true;
        },
        {
          name: 'vault';
          docs: ['Already exists for a same-token duel; created here for a cross-token one.'];
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'account';
                path: 'matchAccount';
              },
              {
                kind: 'account';
                path: 'assetTokenProgram';
              },
              {
                kind: 'account';
                path: 'assetMint';
              },
            ];
            program: {
              kind: 'const';
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89,
              ];
            };
          };
        },
        {
          name: 'assetTokenProgram';
        },
        {
          name: 'associatedTokenProgram';
          address: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
        },
        {
          name: 'systemProgram';
          address: '11111111111111111111111111111111';
        },
      ];
      args: [
        {
          name: 'strategyCommitment';
          type: {
            array: ['u8', 32];
          };
        },
      ];
    },
    {
      name: 'markOracleFailureRefundable';
      discriminator: [77, 149, 213, 170, 189, 167, 193, 154];
      accounts: [
        {
          name: 'matchAccount';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [109, 97, 116, 99, 104];
              },
              {
                kind: 'account';
                path: 'match_account.creator';
                account: 'match';
              },
              {
                kind: 'account';
                path: 'match_account.match_nonce';
                account: 'match';
              },
            ];
          };
        },
      ];
      args: [];
    },
    {
      name: 'reclaimAfterOptionExpiry';
      discriminator: [137, 54, 49, 109, 19, 121, 55, 183];
      accounts: [
        {
          name: 'loser';
          writable: true;
          signer: true;
        },
        {
          name: 'arena';
          docs: ["The loser's own stake Arena; checked in the handler."];
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [97, 114, 101, 110, 97];
              },
              {
                kind: 'account';
                path: 'arena.asset_mint';
                account: 'arena';
              },
              {
                kind: 'account';
                path: 'arena.benchmark_feed_id';
                account: 'arena';
              },
            ];
          };
        },
        {
          name: 'matchAccount';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [109, 97, 116, 99, 104];
              },
              {
                kind: 'account';
                path: 'match_account.creator';
                account: 'match';
              },
              {
                kind: 'account';
                path: 'match_account.match_nonce';
                account: 'match';
              },
            ];
          };
        },
        {
          name: 'assetMint';
        },
        {
          name: 'loserAssetAccount';
          writable: true;
        },
        {
          name: 'vault';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'account';
                path: 'matchAccount';
              },
              {
                kind: 'account';
                path: 'assetTokenProgram';
              },
              {
                kind: 'account';
                path: 'assetMint';
              },
            ];
            program: {
              kind: 'const';
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89,
              ];
            };
          };
        },
        {
          name: 'assetTokenProgram';
        },
      ];
      args: [];
    },
    {
      name: 'refundFailedMatch';
      discriminator: [93, 31, 246, 180, 243, 53, 16, 127];
      accounts: [
        {
          name: 'claimant';
          writable: true;
          signer: true;
        },
        {
          name: 'arena';
          docs: ["The claimant's own stake Arena; checked against the match in the handler."];
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [97, 114, 101, 110, 97];
              },
              {
                kind: 'account';
                path: 'arena.asset_mint';
                account: 'arena';
              },
              {
                kind: 'account';
                path: 'arena.benchmark_feed_id';
                account: 'arena';
              },
            ];
          };
        },
        {
          name: 'matchAccount';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [109, 97, 116, 99, 104];
              },
              {
                kind: 'account';
                path: 'match_account.creator';
                account: 'match';
              },
              {
                kind: 'account';
                path: 'match_account.match_nonce';
                account: 'match';
              },
            ];
          };
        },
        {
          name: 'assetMint';
        },
        {
          name: 'claimantAssetAccount';
          writable: true;
        },
        {
          name: 'vault';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'account';
                path: 'matchAccount';
              },
              {
                kind: 'account';
                path: 'assetTokenProgram';
              },
              {
                kind: 'account';
                path: 'assetMint';
              },
            ];
            program: {
              kind: 'const';
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89,
              ];
            };
          };
        },
        {
          name: 'assetTokenProgram';
        },
      ];
      args: [];
    },
    {
      name: 'refundTie';
      discriminator: [193, 98, 191, 232, 140, 84, 155, 141];
      accounts: [
        {
          name: 'claimant';
          writable: true;
          signer: true;
        },
        {
          name: 'arena';
          docs: ["The claimant's own stake Arena; checked against the match in the handler."];
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [97, 114, 101, 110, 97];
              },
              {
                kind: 'account';
                path: 'arena.asset_mint';
                account: 'arena';
              },
              {
                kind: 'account';
                path: 'arena.benchmark_feed_id';
                account: 'arena';
              },
            ];
          };
        },
        {
          name: 'matchAccount';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [109, 97, 116, 99, 104];
              },
              {
                kind: 'account';
                path: 'match_account.creator';
                account: 'match';
              },
              {
                kind: 'account';
                path: 'match_account.match_nonce';
                account: 'match';
              },
            ];
          };
        },
        {
          name: 'assetMint';
        },
        {
          name: 'claimantAssetAccount';
          writable: true;
        },
        {
          name: 'vault';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'account';
                path: 'matchAccount';
              },
              {
                kind: 'account';
                path: 'assetTokenProgram';
              },
              {
                kind: 'account';
                path: 'assetMint';
              },
            ];
            program: {
              kind: 'const';
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89,
              ];
            };
          };
        },
        {
          name: 'assetTokenProgram';
        },
      ];
      args: [];
    },
    {
      name: 'setPaused';
      discriminator: [91, 60, 125, 192, 176, 225, 166, 218];
      accounts: [
        {
          name: 'admin';
          signer: true;
          relations: ['config'];
        },
        {
          name: 'config';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
      ];
      args: [
        {
          name: 'paused';
          type: 'bool';
        },
      ];
    },
    {
      name: 'settleMatch';
      discriminator: [71, 124, 117, 96, 191, 217, 116, 24];
      accounts: [
        {
          name: 'arena';
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [97, 114, 101, 110, 97];
              },
              {
                kind: 'account';
                path: 'arena.asset_mint';
                account: 'arena';
              },
              {
                kind: 'account';
                path: 'arena.benchmark_feed_id';
                account: 'arena';
              },
            ];
          };
          relations: ['matchAccount'];
        },
        {
          name: 'config';
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: 'matchAccount';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [109, 97, 116, 99, 104];
              },
              {
                kind: 'account';
                path: 'match_account.creator';
                account: 'match';
              },
              {
                kind: 'account';
                path: 'match_account.match_nonce';
                account: 'match';
              },
            ];
          };
        },
        {
          name: 'priceUpdate';
        },
      ];
      args: [];
    },
    {
      name: 'submitRoundPredictions';
      discriminator: [12, 6, 135, 30, 185, 88, 248, 11];
      accounts: [
        {
          name: 'orchestrator';
          signer: true;
        },
        {
          name: 'config';
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: 'matchAccount';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [109, 97, 116, 99, 104];
              },
              {
                kind: 'account';
                path: 'match_account.creator';
                account: 'match';
              },
              {
                kind: 'account';
                path: 'match_account.match_nonce';
                account: 'match';
              },
            ];
          };
        },
      ];
      args: [
        {
          name: 'round';
          type: 'u8';
        },
        {
          name: 'creatorInput';
          type: {
            defined: {
              name: 'predictionInput';
            };
          };
        },
        {
          name: 'challengerInput';
          type: {
            defined: {
              name: 'predictionInput';
            };
          };
        },
      ];
    },
    {
      name: 'updateProtocolConfig';
      discriminator: [197, 97, 123, 54, 221, 168, 11, 135];
      accounts: [
        {
          name: 'admin';
          signer: true;
          relations: ['config'];
        },
        {
          name: 'config';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
      ];
      args: [
        {
          name: 'params';
          type: {
            defined: {
              name: 'protocolParams';
            };
          };
        },
      ];
    },
  ];
  accounts: [
    {
      name: 'arena';
      discriminator: [243, 215, 44, 44, 231, 211, 232, 168];
    },
    {
      name: 'match';
      discriminator: [236, 63, 169, 38, 15, 56, 196, 162];
    },
    {
      name: 'priceUpdateV2';
      discriminator: [34, 241, 35, 99, 157, 126, 244, 205];
    },
    {
      name: 'protocolConfig';
      discriminator: [207, 91, 250, 28, 152, 179, 215, 209];
    },
  ];
  events: [
    {
      name: 'matchActivated';
      discriminator: [97, 115, 184, 205, 137, 185, 66, 125];
    },
    {
      name: 'matchSettled';
      discriminator: [243, 201, 134, 151, 193, 131, 223, 150];
    },
    {
      name: 'optionExercised';
      discriminator: [34, 100, 89, 14, 247, 159, 22, 97];
    },
    {
      name: 'roundSubmitted';
      discriminator: [20, 14, 129, 197, 148, 10, 222, 118];
    },
  ];
  errors: [
    {
      code: 6000;
      name: 'protocolPaused';
      msg: 'Protocol is paused; new risk cannot be created.';
    },
    {
      code: 6001;
      name: 'arenaInactive';
      msg: 'Arena is not active.';
    },
    {
      code: 6002;
      name: 'notAdmin';
      msg: 'Caller is not the protocol admin.';
    },
    {
      code: 6003;
      name: 'notOrchestrator';
      msg: 'Caller is not the configured orchestrator.';
    },
    {
      code: 6004;
      name: 'selfChallenge';
      msg: 'A player cannot challenge themselves.';
    },
    {
      code: 6005;
      name: 'zeroAmount';
      msg: 'Amount must be greater than zero.';
    },
    {
      code: 6006;
      name: 'durationOutOfBounds';
      msg: 'Match duration is outside the configured bounds.';
    },
    {
      code: 6007;
      name: 'invalidMatchState';
      msg: 'Match is not in the required state for this action.';
    },
    {
      code: 6008;
      name: 'joinWindowClosed';
      msg: 'The join window for this match has closed.';
    },
    {
      code: 6009;
      name: 'activationWindowClosed';
      msg: 'The activation window for this match has closed.';
    },
    {
      code: 6010;
      name: 'activationWindowStillOpen';
      msg: 'The activation window is still open; the match is not refundable yet.';
    },
    {
      code: 6011;
      name: 'mathOverflow';
      msg: 'Arithmetic overflow.';
    },
    {
      code: 6012;
      name: 'invalidPrice';
      msg: 'Price is zero, negative, or otherwise unusable.';
    },
    {
      code: 6013;
      name: 'incompatibleExponent';
      msg: 'Feed exponent cannot be converted to the Arena exponent without losing precision.';
    },
    {
      code: 6014;
      name: 'accountMismatch';
      msg: 'Account does not belong to this match or arena.';
    },
    {
      code: 6015;
      name: 'mintMismatch';
      msg: 'Token mint does not match the configured mint.';
    },
    {
      code: 6016;
      name: 'depositMismatch';
      msg: 'Deposit accounting does not match the expected stake.';
    },
    {
      code: 6017;
      name: 'alreadySettled';
      msg: 'This action has already been taken and cannot be replayed.';
    },
    {
      code: 6018;
      name: 'unverifiedPrice';
      msg: 'Price update is not fully verified.';
    },
    {
      code: 6019;
      name: 'feedMismatch';
      msg: "Price update is for a different feed than this Arena's benchmark.";
    },
    {
      code: 6020;
      name: 'confidenceTooHigh';
      msg: 'Price confidence exceeds the configured maximum ratio.';
    },
    {
      code: 6021;
      name: 'stalePrice';
      msg: 'Price update is older than the configured maximum age.';
    },
    {
      code: 6022;
      name: 'invalidRound';
      msg: 'Round index is outside 0..3.';
    },
    {
      code: 6023;
      name: 'roundWindowClosed';
      msg: 'This round is not open for submission yet, or its window has closed.';
    },
    {
      code: 6024;
      name: 'roundAlreadySubmitted';
      msg: 'This round has already been submitted.';
    },
    {
      code: 6025;
      name: 'invalidPredictionOutcome';
      msg: 'A non-valid prediction outcome must carry a zero price, and Unsubmitted may not be submitted.';
    },
    {
      code: 6026;
      name: 'targetNotReached';
      msg: 'The match has not reached its target end time.';
    },
    {
      code: 6027;
      name: 'settlementWindowMissed';
      msg: 'No price update published inside the settlement window.';
    },
    {
      code: 6028;
      name: 'settlementDeadlineNotPassed';
      msg: 'The settlement deadline has not passed yet.';
    },
    {
      code: 6029;
      name: 'notWinner';
      msg: 'Caller is not the winner of this match.';
    },
    {
      code: 6030;
      name: 'optionWindowClosed';
      msg: 'The option exercise window has closed.';
    },
    {
      code: 6031;
      name: 'optionWindowStillOpen';
      msg: 'The option exercise window is still open.';
    },
    {
      code: 6032;
      name: 'unsafeMintExtension';
      msg: 'Mint carries a Token-2022 extension that is unsafe for escrow; see code.md 3.1.';
    },
    {
      code: 6033;
      name: 'stakeBelowMinimum';
      msg: 'Stake is below the 0.05-token minimum.';
    },
    {
      code: 6034;
      name: 'arenaMismatch';
      msg: 'Both stake Arenas must share the benchmark feed, exponent and quote mint.';
    },
  ];
  types: [
    {
      name: 'arena';
      type: {
        kind: 'struct';
        fields: [
          {
            name: 'assetMint';
            docs: [
              'Devnet test copy of the PreStocks asset. Never the real mainnet mint. `code.md` §2.',
            ];
            type: 'pubkey';
          },
          {
            name: 'assetTokenProgram';
            type: 'pubkey';
          },
          {
            name: 'quoteMint';
            type: 'pubkey';
          },
          {
            name: 'quoteTokenProgram';
            type: 'pubkey';
          },
          {
            name: 'benchmarkFeedId';
            docs: [
              'Pyth 32-byte Core feed ID. Never a Terminal/Lazer identifier such as 1314 or 922.',
            ];
            type: {
              array: ['u8', 32];
            };
          },
          {
            name: 'benchmarkExponent';
            type: 'i32';
          },
          {
            name: 'standardProfile';
            type: {
              defined: {
                name: 'timingProfile';
              };
            };
          },
          {
            name: 'demoProfile';
            type: {
              defined: {
                name: 'timingProfile';
              };
            };
          },
          {
            name: 'roundWeightsBps';
            type: {
              array: ['u16', 3];
            };
          },
          {
            name: 'maxPriceAgeSeconds';
            type: 'u64';
          },
          {
            name: 'maxConfidenceBps';
            type: 'u64';
          },
          {
            name: 'active';
            type: 'bool';
          },
          {
            name: 'bump';
            type: 'u8';
          },
        ];
      };
    },
    {
      name: 'arenaParams';
      type: {
        kind: 'struct';
        fields: [
          {
            name: 'benchmarkFeedId';
            docs: [
              'Pyth 32-byte Core feed ID. A Terminal/Lazer identifier (1314, 922) is not a Core ID and',
              'must never be stored here. `code.md` §3.2.',
            ];
            type: {
              array: ['u8', 32];
            };
          },
          {
            name: 'benchmarkExponent';
            type: 'i32';
          },
          {
            name: 'standardProfile';
            type: {
              defined: {
                name: 'timingProfile';
              };
            };
          },
          {
            name: 'demoProfile';
            type: {
              defined: {
                name: 'timingProfile';
              };
            };
          },
          {
            name: 'maxPriceAgeSeconds';
            type: 'u64';
          },
          {
            name: 'maxConfidenceBps';
            type: 'u64';
          },
        ];
      };
    },
    {
      name: 'match';
      type: {
        kind: 'struct';
        fields: [
          {
            name: 'arena';
            docs: [
              "The creator's stake Arena. Its benchmark, timing and quote mint govern the whole match.",
            ];
            type: 'pubkey';
          },
          {
            name: 'challengerArena';
            docs: [
              "The challenger's stake Arena; equal to `arena` in a same-token duel. `create_match` requires",
              'the same benchmark and quote mint, so the only difference is the staked asset.',
            ];
            type: 'pubkey';
          },
          {
            name: 'creator';
            type: 'pubkey';
          },
          {
            name: 'challenger';
            docs: [
              'Pubkey::default() until join_match. Compare against creator to reject a self-challenge.',
            ];
            type: 'pubkey';
          },
          {
            name: 'matchNonce';
            type: 'u64';
          },
          {
            name: 'creatorStakeAmount';
            type: 'u64';
          },
          {
            name: 'challengerStakeAmount';
            type: 'u64';
          },
          {
            name: 'creatorStakeStrike';
            docs: [
              "Quote amount the winner pays to take the loser's stake, one per possible loser, all fixed",
              'by the creator and accepted as-is by the challenger. Two strikes rather than an exchange',
              'rate, so no price for either asset is ever needed. `code.md` §19.',
            ];
            type: 'u64';
          },
          {
            name: 'challengerStakeStrike';
            type: 'u64';
          },
          {
            name: 'profileKind';
            type: {
              defined: {
                name: 'matchProfileKind';
              };
            };
          },
          {
            name: 'maxPriceAgeSeconds';
            docs: [
              'Effective oracle limits fixed at creation; protocol updates affect new matches only.',
            ];
            type: 'u64';
          },
          {
            name: 'maxConfidenceBps';
            type: 'u64';
          },
          {
            name: 'creatorStrategyCommitment';
            type: {
              array: ['u8', 32];
            };
          },
          {
            name: 'challengerStrategyCommitment';
            type: {
              array: ['u8', 32];
            };
          },
          {
            name: 'createdTs';
            type: 'i64';
          },
          {
            name: 'joinDeadlineTs';
            type: 'i64';
          },
          {
            name: 'activationDeadlineTs';
            type: 'i64';
          },
          {
            name: 'startTs';
            type: 'i64';
          },
          {
            name: 'roundDueTs';
            type: {
              array: ['i64', 3];
            };
          },
          {
            name: 'targetEndTs';
            type: 'i64';
          },
          {
            name: 'settlementDeadlineTs';
            type: 'i64';
          },
          {
            name: 'optionExpiryTs';
            type: 'i64';
          },
          {
            name: 'startObservation';
            type: {
              defined: {
                name: 'priceObservation';
              };
            };
          },
          {
            name: 'finalObservation';
            type: {
              defined: {
                name: 'priceObservation';
              };
            };
          },
          {
            name: 'predictions';
            docs: ['[round][player_index]; player_index 0 = creator, 1 = challenger.'];
            type: {
              array: [
                {
                  array: [
                    {
                      defined: {
                        name: 'predictionRecord';
                      };
                    },
                    2,
                  ];
                },
                3,
              ];
            };
          },
          {
            name: 'submittedRounds';
            docs: ['Bit i set once round i has been submitted. Enforces single-use per round.'];
            type: 'u8';
          },
          {
            name: 'creatorScore';
            type: 'u128';
          },
          {
            name: 'challengerScore';
            type: 'u128';
          },
          {
            name: 'winner';
            type: {
              defined: {
                name: 'winner';
              };
            };
          },
          {
            name: 'state';
            type: {
              defined: {
                name: 'matchState';
              };
            };
          },
          {
            name: 'creatorDeposit';
            docs: [
              'Internal deposit accounting. Entitlements derive from these, never from raw vault',
              'balance, so an unsolicited transfer into the vault grants nobody anything. `code.md` §7.1.',
            ];
            type: 'u64';
          },
          {
            name: 'challengerDeposit';
            type: 'u64';
          },
          {
            name: 'winnerStakeClaimed';
            type: 'bool';
          },
          {
            name: 'creatorRefunded';
            type: 'bool';
          },
          {
            name: 'challengerRefunded';
            type: 'bool';
          },
          {
            name: 'bump';
            type: 'u8';
          },
        ];
      };
    },
    {
      name: 'matchActivated';
      type: {
        kind: 'struct';
        fields: [
          {
            name: 'matchAccount';
            type: 'pubkey';
          },
          {
            name: 'startPrice';
            type: 'i64';
          },
          {
            name: 'startPublishTime';
            type: 'i64';
          },
          {
            name: 'targetEndTs';
            type: 'i64';
          },
        ];
      };
    },
    {
      name: 'matchProfileKind';
      type: {
        kind: 'enum';
        variants: [
          {
            name: 'standard';
          },
          {
            name: 'demo';
          },
        ];
      };
    },
    {
      name: 'matchSettled';
      type: {
        kind: 'struct';
        fields: [
          {
            name: 'matchAccount';
            type: 'pubkey';
          },
          {
            name: 'finalPrice';
            type: 'i64';
          },
          {
            name: 'finalPublishTime';
            type: 'i64';
          },
          {
            name: 'creatorScore';
            type: 'u128';
          },
          {
            name: 'challengerScore';
            type: 'u128';
          },
          {
            name: 'winner';
            type: {
              defined: {
                name: 'winner';
              };
            };
          },
        ];
      };
    },
    {
      name: 'matchState';
      docs: ['`code.md` §7.2.'];
      type: {
        kind: 'enum';
        variants: [
          {
            name: 'open';
          },
          {
            name: 'ready';
          },
          {
            name: 'active';
          },
          {
            name: 'awaitingSettlement';
          },
          {
            name: 'winnerOptionOpen';
          },
          {
            name: 'tieRefundable';
          },
          {
            name: 'failureRefundable';
          },
          {
            name: 'optionExercised';
          },
          {
            name: 'optionExpired';
          },
          {
            name: 'cancelled';
          },
        ];
      };
    },
    {
      name: 'matchTerms';
      docs: [
        'Every term is fixed by the creator and accepted as-is by the challenger; nothing is negotiated',
        'after deposit.',
      ];
      type: {
        kind: 'struct';
        fields: [
          {
            name: 'creatorStakeAmount';
            type: 'u64';
          },
          {
            name: 'challengerStakeAmount';
            type: 'u64';
          },
          {
            name: 'creatorStakeStrike';
            type: 'u64';
          },
          {
            name: 'challengerStakeStrike';
            type: 'u64';
          },
          {
            name: 'profileKind';
            type: {
              defined: {
                name: 'matchProfileKind';
              };
            };
          },
        ];
      };
    },
    {
      name: 'optionExercised';
      type: {
        kind: 'struct';
        fields: [
          {
            name: 'matchAccount';
            type: 'pubkey';
          },
          {
            name: 'winner';
            type: 'pubkey';
          },
          {
            name: 'loser';
            type: 'pubkey';
          },
          {
            name: 'assetAmount';
            type: 'u64';
          },
          {
            name: 'strikeAmount';
            type: 'u64';
          },
        ];
      };
    },
    {
      name: 'predictionInput';
      docs: [
        "One player's prediction for one round, as the orchestrator submits it. `code.md` §5.5.",
        '',
        'Distinct from `PredictionRecord` because `Unsubmitted` is a *stored* state the program reaches',
        'on its own when a round is never submitted, and must never be something the orchestrator can',
        'claim happened.',
      ];
      type: {
        kind: 'struct';
        fields: [
          {
            name: 'outcome';
            type: {
              defined: {
                name: 'predictionOutcome';
              };
            };
          },
          {
            name: 'predictedPrice';
            type: 'i64';
          },
        ];
      };
    },
    {
      name: 'predictionOutcome';
      docs: [
        'Why a prediction is or is not usable. A non-Valid outcome carries a zero price and receives',
        'MAX_ROUND_ERROR_BPS. `code.md` §5.5.',
      ];
      type: {
        kind: 'enum';
        variants: [
          {
            name: 'unsubmitted';
          },
          {
            name: 'valid';
          },
          {
            name: 'timeout';
          },
          {
            name: 'apiError';
          },
          {
            name: 'malformed';
          },
        ];
      };
    },
    {
      name: 'predictionRecord';
      type: {
        kind: 'struct';
        fields: [
          {
            name: 'outcome';
            type: {
              defined: {
                name: 'predictionOutcome';
              };
            };
          },
          {
            name: 'predictedPrice';
            type: 'i64';
          },
        ];
      };
    },
    {
      name: 'priceFeedMessage';
      repr: {
        kind: 'c';
      };
      type: {
        kind: 'struct';
        fields: [
          {
            name: 'feedId';
            docs: [
              "`FeedId` but avoid the type alias because of compatibility issues with Anchor's `idl-build` feature.",
            ];
            type: {
              array: ['u8', 32];
            };
          },
          {
            name: 'price';
            type: 'i64';
          },
          {
            name: 'conf';
            type: 'u64';
          },
          {
            name: 'exponent';
            type: 'i32';
          },
          {
            name: 'publishTime';
            docs: ['The timestamp of this price update in seconds'];
            type: 'i64';
          },
          {
            name: 'prevPublishTime';
            docs: [
              'The timestamp of the previous price update. This field is intended to allow users to',
              'identify the single unique price update for any moment in time:',
              'for any time t, the unique update is the one such that prev_publish_time < t <= publish_time.',
              '',
              'Note that there may not be such an update while we are migrating to the new message-sending logic,',
              'as some price updates on pythnet may not be sent to other chains (because the message-sending',
              'logic may not have triggered). We can solve this problem by making the message-sending mandatory',
              '(which we can do once publishers have migrated over).',
              '',
              'Additionally, this field may be equal to publish_time if the message is sent on a slot where',
              'where the aggregation was unsuccesful. This problem will go away once all publishers have',
              'migrated over to a recent version of pyth-agent.',
            ];
            type: 'i64';
          },
          {
            name: 'emaPrice';
            type: 'i64';
          },
          {
            name: 'emaConf';
            type: 'u64';
          },
        ];
      };
    },
    {
      name: 'priceObservation';
      docs: ['A Pyth observation recorded on-chain after validation. `code.md` §3.2.'];
      type: {
        kind: 'struct';
        fields: [
          {
            name: 'price';
            type: 'i64';
          },
          {
            name: 'exponent';
            type: 'i32';
          },
          {
            name: 'confidence';
            type: 'u64';
          },
          {
            name: 'publishTime';
            type: 'i64';
          },
        ];
      };
    },
    {
      name: 'priceUpdateV2';
      docs: [
        'A price update account. This account is used by the Pyth Receiver program to store a verified price update from a Pyth price feed.',
        'It contains:',
        '- `write_authority`: The write authority for this account. This authority can close this account to reclaim rent or update the account to contain a different price update.',
        '- `verification_level`: The [`VerificationLevel`] of this price update. This represents how many Wormhole guardian signatures have been verified for this price update.',
        '- `price_message`: The actual price update.',
        '- `posted_slot`: The slot at which this price update was posted.',
      ];
      type: {
        kind: 'struct';
        fields: [
          {
            name: 'writeAuthority';
            type: 'pubkey';
          },
          {
            name: 'verificationLevel';
            type: {
              defined: {
                name: 'verificationLevel';
              };
            };
          },
          {
            name: 'priceMessage';
            type: {
              defined: {
                name: 'priceFeedMessage';
              };
            };
          },
          {
            name: 'postedSlot';
            type: 'u64';
          },
        ];
      };
    },
    {
      name: 'protocolConfig';
      type: {
        kind: 'struct';
        fields: [
          {
            name: 'admin';
            type: 'pubkey';
          },
          {
            name: 'orchestrator';
            type: 'pubkey';
          },
          {
            name: 'paused';
            docs: [
              'Blocks match creation and activation only. Never blocks a refund, claim, exercise or',
              'expiry reclaim. `code.md` §7.4.',
            ];
            type: 'bool';
          },
          {
            name: 'minDurationSeconds';
            type: 'i64';
          },
          {
            name: 'maxDurationSeconds';
            type: 'i64';
          },
          {
            name: 'maxPriceAgeSeconds';
            type: 'u64';
          },
          {
            name: 'maxConfidenceBps';
            type: 'u64';
          },
          {
            name: 'bump';
            type: 'u8';
          },
        ];
      };
    },
    {
      name: 'protocolParams';
      type: {
        kind: 'struct';
        fields: [
          {
            name: 'orchestrator';
            type: 'pubkey';
          },
          {
            name: 'minDurationSeconds';
            type: 'i64';
          },
          {
            name: 'maxDurationSeconds';
            type: 'i64';
          },
          {
            name: 'maxPriceAgeSeconds';
            type: 'u64';
          },
          {
            name: 'maxConfidenceBps';
            type: 'u64';
          },
        ];
      };
    },
    {
      name: 'roundSubmitted';
      docs: [
        'One event for both outcomes: an indexer must never see one prediction before the other.',
      ];
      type: {
        kind: 'struct';
        fields: [
          {
            name: 'matchAccount';
            type: 'pubkey';
          },
          {
            name: 'round';
            type: 'u8';
          },
          {
            name: 'creatorOutcome';
            type: {
              defined: {
                name: 'predictionOutcome';
              };
            };
          },
          {
            name: 'creatorPredictedPrice';
            type: 'i64';
          },
          {
            name: 'challengerOutcome';
            type: {
              defined: {
                name: 'predictionOutcome';
              };
            };
          },
          {
            name: 'challengerPredictedPrice';
            type: 'i64';
          },
        ];
      };
    },
    {
      name: 'timingProfile';
      docs: ['Timing for one match profile, in seconds relative to activation. `code.md` §5.1.'];
      type: {
        kind: 'struct';
        fields: [
          {
            name: 'durationSeconds';
            type: 'i64';
          },
          {
            name: 'roundDueOffsets';
            type: {
              array: ['i64', 3];
            };
          },
          {
            name: 'settlementGraceSeconds';
            type: 'i64';
          },
          {
            name: 'exerciseWindowSeconds';
            type: 'i64';
          },
          {
            name: 'joinWindowSeconds';
            docs: [
              'How long an Open match stays joinable, and how long a Ready match stays activatable.',
              'These live here rather than as constants so every deadline is Arena-configured and can',
              'therefore be driven to expiry in a test. `code.md` §7.1 puts timing profiles on the Arena.',
            ];
            type: 'i64';
          },
          {
            name: 'activationWindowSeconds';
            type: 'i64';
          },
        ];
      };
    },
    {
      name: 'verificationLevel';
      docs: [
        'Pyth price updates are bridged to all blockchains via Wormhole.',
        'Using the price updates on another chain requires verifying the signatures of the Wormhole guardians.',
        'The usual process is to check the signatures for two thirds of the total number of guardians, but this can be cumbersome on Solana because of the transaction size limits,',
        'so we also allow for partial verification.',
        '',
        'This enum represents how much a price update has been verified:',
        '- If `Full`, we have verified the signatures for two thirds of the current guardians.',
        '- If `Partial`, only `num_signatures` guardian signatures have been checked.',
        '',
        '# Warning',
        'Using partially verified price updates is dangerous, as it lowers the threshold of guardians that need to collude to produce a malicious price update.',
      ];
      type: {
        kind: 'enum';
        variants: [
          {
            name: 'partial';
            fields: [
              {
                name: 'numSignatures';
                type: 'u8';
              },
            ];
          },
          {
            name: 'full';
          },
        ];
      };
    },
    {
      name: 'winner';
      type: {
        kind: 'enum';
        variants: [
          {
            name: 'unset';
          },
          {
            name: 'creator';
          },
          {
            name: 'challenger';
          },
          {
            name: 'tie';
          },
        ];
      };
    },
  ];
};
