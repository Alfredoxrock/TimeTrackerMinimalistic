const { withAndroidManifest } = require("expo/config-plugins");

/**
 * Adds the BILLING permission required by Google Play In-App Purchases
 * (react-native-purchases does not auto-include it in its own AndroidManifest).
 */
module.exports = function withBillingPermission(config) {
    return withAndroidManifest(config, (mod) => {
        const manifest = mod.modResults.manifest;
        if (!manifest["uses-permission"]) manifest["uses-permission"] = [];
        const already = manifest["uses-permission"].some(
            (p) => p.$?.["android:name"] === "com.android.vending.BILLING"
        );
        if (!already) {
            manifest["uses-permission"].push({
                $: { "android:name": "com.android.vending.BILLING" },
            });
        }
        return mod;
    });
};
