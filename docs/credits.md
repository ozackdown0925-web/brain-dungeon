# 使った素材と出どころ

公開リポジトリに置くので、自由に使ってよいもの（CC0 など）だけを使う。使ったら、ここに書く。

## 絵

- タイトル画面の絵：プログラムで1点ずつ描いたドット絵（`js/game/titleart.js`。素材は使っていない。16ビット時代のドット絵の雰囲気だけを目ざし、特定のゲームの絵やキャラはまねしない）。
- 仲間の絵：1点ずつの地図で描いたドット絵（`js/game/sprites.js`。16×24点、5職業×3方向×6コマ、髪の色8種、手に持つ武器）。保護者が描いた横向きの戦士と正面の素体をもとにしている。素材は使っていない。
- 敵とボスの絵：1点ずつの地図で描いたドット絵（`js/game/monsters.js`。ふつうの敵は16×24点・3方向（キノコの魔物・大きな蜂も）、大オオカミ 52×40点、大木の魔物 64×64点）。素材は使っていない。
- 地面と部屋の絵：プログラムで1点ずつ描いたドット絵（`js/game/tiles.js`。地面・道・草むら・水・橋・木・森のしげみ・岩のがけ・鍵の扉・つる）。素材は使っていない。
- 町・顔の絵：段階7-2 でプログラムで描く（2026-10-17 保護者と決定。素材集は使わない）。

## 音

- 音を鳴らすしくみ：`js/game/sound.js`（Web Audio）。ファイルは `assets/sound/`。
- **NOT JAM MUSIC PACK 2**（Not Jam、<https://not-jam.itch.io/not-jam-music-pack-2>、CC0 1.0。名前の表示は不要だが、ここに書いておく）。OGG（BGM）と WAV（効果音）を、iPadOS 16 の Safari で鳴らせる mp3 にした（BGM 96kbps・効果音 64kbps モノラル）。
  - BGM：タイトル Lich King Ascendant／エルム村 Lazy River Rally／ワールドマップ Rainy Foothills／知恵の試練 Crystal Caverns／ダンジョン Leading the Charge／ボス Locrian Chipdoom（どれも loopable 版）。
  - 効果音：パックの SFX 22個と、You Died（全滅などのとき）。どの音をどこで鳴らすかは `sound.js` の FILES。
