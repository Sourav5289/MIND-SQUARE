import security from 'eslint-plugin-security';

export default [
    security.configs.recommended,
    {
        files: ["**/*.js", "**/*.jsx"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
        },
        plugins: {
            security: security,
        },
        rules: {
            // Disable the highly noisy object injection detection rule
            "security/detect-object-injection": "off",
        },
    }
];