export const preprocessMarkdown = (markdown: string): string => {
    return markdown.replace(
        /\*\*([^*]+?)([：:;,!?。，；！？\)\]\}"'》>\-–—\/\\|@#$%^&*+=~`])\*\*/g,
        '**$1$2** '
    );
};
