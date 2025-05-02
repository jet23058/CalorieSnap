'use server';
/**
 * @fileOverview A calorie estimation AI agent.
 *
 * - estimateCalorieCount - A function that handles the calorie estimation process.
 * - EstimateCalorieCountInput - The input type for the estimateCalorieCount function.
 * - EstimateCalorieCountOutput - The return type for the estimateCalorieCount function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';

const EstimateCalorieCountInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      "A photo of a food item, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type EstimateCalorieCountInput = z.infer<typeof EstimateCalorieCountInputSchema>;

const EstimateCalorieCountOutputSchema = z.object({
  foodItem: z.string().describe('The identified food item in the image.'),
  calorieEstimate: z.number().describe('The estimated calorie count of the food item.'),
  confidence: z.number().describe('The confidence level of the calorie estimation (0-1).'),
});
export type EstimateCalorieCountOutput = z.infer<typeof EstimateCalorieCountOutputSchema>;

export async function estimateCalorieCount(
  input: EstimateCalorieCountInput
): Promise<EstimateCalorieCountOutput> {
  return estimateCalorieCountFlow(input);
}

const prompt = ai.definePrompt({
  name: 'estimateCalorieCountPrompt',
  input: {
    schema: z.object({
      photoDataUri: z
        .string()
        .describe(
          "A photo of a food item, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
        ),
    }),
  },
  output: {
    schema: z.object({
      foodItem: z.string().describe('The identified food item in the image.'),
      calorieEstimate: z.number().describe('The estimated calorie count of the food item.'),
      confidence: z.number().describe('The confidence level of the calorie estimation (0-1).'),
    }),
  },
  prompt: `You are a nutrition expert. You will identify the food item in the image and estimate its calorie count.

  Analyze the following image and provide the food item, calorie estimate and confidence level.

  Image: {{media url=photoDataUri}}
  `,
});

const estimateCalorieCountFlow = ai.defineFlow<
  typeof EstimateCalorieCountInputSchema,
  typeof EstimateCalorieCountOutputSchema
>({
  name: 'estimateCalorieCountFlow',
  inputSchema: EstimateCalorieCountInputSchema,
  outputSchema: EstimateCalorieCountOutputSchema,
},
async input => {
  const {output} = await prompt(input);
  return output!;
});