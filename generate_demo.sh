#!/bin/bash

# Ensure we are in the project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
CONFIG_FILE="$SCRIPT_DIR/demo/config.json"
TEMPLATE_FILE="$SCRIPT_DIR/demo/index.html.template"
OUTPUT_FILE="$SCRIPT_DIR/demo/index.html"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "Error: $CONFIG_FILE not found."
    exit 1
fi

if [ ! -f "$TEMPLATE_FILE" ]; then
    echo "Error: $TEMPLATE_FILE not found."
    exit 1
fi

# Function to extract JSON value using python (more reliable than sed for JSON)
get_json_val() {
    python3 -c "import json; print(json.load(open('$CONFIG_FILE'))$1)"
}

BASE_PATH=$(get_json_val "['basePath']")
CLIENT_ID=$(get_json_val "['auth']['clientId']")
REDIRECT_URI=$(get_json_val "['auth']['redirectUri']")
TOKEN_ENDPOINT=$(get_json_val "['auth']['tokenEndpoint']")
VERSION=$(python3 -c "import json; print(json.load(open('$SCRIPT_DIR/package.json'))['version'])")

echo "Generating $OUTPUT_FILE from $TEMPLATE_FILE..."
echo "Base Path: $BASE_PATH"
echo "Client ID: $CLIENT_ID"
echo "Version: $VERSION"

# Use sed to replace placeholders
sed "s|{{BASE_PATH}}|$BASE_PATH|g; 
     s|{{CLIENT_ID}}|$CLIENT_ID|g; 
     s|{{REDIRECT_URI}}|$REDIRECT_URI|g; 
     s|{{TOKEN_ENDPOINT}}|$TOKEN_ENDPOINT|g;
     s|{{VERSION}}|$VERSION|g" "$TEMPLATE_FILE" > "$OUTPUT_FILE"

echo "Done."