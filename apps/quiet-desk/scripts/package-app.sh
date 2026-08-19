#!/bin/zsh

set -euo pipefail

script_dir=${0:A:h}
project_dir=${script_dir:h}

cd "$project_dir"
swift build -c release

binary_dir=$(swift build -c release --show-bin-path)
bundle_path="$binary_dir/Quiet Desk.app"

if [[ ! -x "$binary_dir/QuietDesk" ]]; then
  print -u2 "Release executable was not produced at $binary_dir/QuietDesk"
  exit 1
fi

rm -rf -- "$bundle_path"
mkdir -p "$bundle_path/Contents/MacOS" "$bundle_path/Contents/Resources"
cp "$binary_dir/QuietDesk" "$bundle_path/Contents/MacOS/QuietDesk"
cp "$project_dir/AppResources/Info.plist" "$bundle_path/Contents/Info.plist"
cp "$project_dir/Sources/QuietDeskCore/Resources/synthetic-feed.json" \
  "$bundle_path/Contents/Resources/synthetic-feed.json"

codesign --force --deep --sign - "$bundle_path"
print "$bundle_path"
