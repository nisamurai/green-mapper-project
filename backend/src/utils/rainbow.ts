export const rainbowColorInkantation = (s: string): string =>
	[...s]
		.map(
			(c, i) =>
				`\x1b[38;2;${[
					[210, 15, 57],
					[254, 100, 11],
					[223, 142, 29],
					[64, 160, 43],
					[4, 165, 229],
					[30, 102, 245],
					[136, 57, 239],
				][i % 7].join(";")}m${c}\x1b[0m`,
		)
		.join("");
