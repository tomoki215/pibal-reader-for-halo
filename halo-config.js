// HALO の配信元はリポジトリへ記載せず、埋め込み時の origin-only referrer から取得する。
// 明示的な許可リストを設定した場合はそちらを優先する（値はパスを含まない HTTP(S) origin）。
window.PIBAL_HALO_ALLOWED_ORIGINS = window.PIBAL_HALO_ALLOWED_ORIGINS || [];

// 任意の HTTP(S) サイトが埋め込み元になれる方式。結果はユーザーが押した時だけ送信する。
// 許可リストを利用する配信では false を設定する。
window.PIBAL_HALO_TRUST_EMBEDDING_ORIGIN = window.PIBAL_HALO_TRUST_EMBEDDING_ORIGIN ?? true;
