#!/bin/bash
# リージョンのリソース状況を確認するスクリプト

set -e

REGION="${1:-nrt}"  # デフォルトは東京リージョン

echo "=========================================="
echo "リージョンリソース状況の確認"
echo "=========================================="
echo ""
echo "確認対象リージョン: $REGION"
echo ""

# リージョンのリソース状況を確認
echo "[1/3] リージョンのリソース状況を確認中..."
RESOURCE_INFO=$(fly platform regions 2>&1 | grep -E "($REGION|Region|CAPACITY)" | head -20)

if [ -z "$RESOURCE_INFO" ]; then
    echo "警告: リージョン情報の取得に失敗しました"
    echo "手動で確認: fly platform regions"
    exit 1
fi

echo "$RESOURCE_INFO"
echo ""

# リージョンの詳細情報を確認
echo "[2/3] リージョンの詳細情報を確認中..."
REGION_DETAIL=$(fly platform regions 2>&1 | grep -A 5 "$REGION" | head -10)

if [ ! -z "$REGION_DETAIL" ]; then
    echo "$REGION_DETAIL"
    echo ""
fi

# デプロイの試行可能性を確認
echo "[3/3] デプロイの試行可能性を確認中..."
echo ""

# CAPACITYが負の値（リソース不足）かどうかを確認
CAPACITY=$(fly platform regions 2>&1 | grep "$REGION" | awk '{print $NF}' | head -1)

if [ ! -z "$CAPACITY" ]; then
    # 数値かどうかを確認
    if [[ "$CAPACITY" =~ ^-?[0-9]+$ ]]; then
        if [ "$CAPACITY" -lt 0 ]; then
            echo "❌ リソース不足: CAPACITY = $CAPACITY"
            echo "   このリージョンではデプロイが失敗する可能性が高いです。"
            echo "   シンガポールリージョンでの運用を継続することを推奨します。"
        else
            echo "✅ リソース利用可能: CAPACITY = $CAPACITY"
            echo "   このリージョンでデプロイを試行できます。"
        fi
    else
        echo "⚠️  CAPACITY情報の解析に失敗しました: $CAPACITY"
        echo "   手動で確認してください。"
    fi
else
    echo "⚠️  CAPACITY情報を取得できませんでした。"
    echo "   手動で確認してください: fly platform regions"
fi

echo ""
echo "=========================================="
echo "確認完了"
echo "=========================================="
echo ""
echo "次のステップ:"
echo "  - リソースが利用可能な場合: ./scripts/switch-back-to-primary-region.sh"
echo "  - リソースが不足している場合: シンガポールリージョンで運用を継続"
echo ""






