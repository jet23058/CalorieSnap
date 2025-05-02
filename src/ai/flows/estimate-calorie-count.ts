'use server';
/**
 * @fileOverview 卡路里估計 AI 代理。
 *
 * - estimateCalorieCount - 處理卡路里估計流程的函數。
 * - EstimateCalorieCountInput - estimateCalorieCount 函數的輸入類型。
 * - EstimateCalorieCountOutput - estimateCalorieCount 函數的返回類型。
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';

const EstimateCalorieCountInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      "食物品項的照片，格式為 data URI，必須包含 MIME 類型並使用 Base64 編碼。預期格式：'data:<mimetype>;base64,<encoded_data>'。"
    ),
});
export type EstimateCalorieCountInput = z.infer<typeof EstimateCalorieCountInputSchema>;

const EstimateCalorieCountOutputSchema = z.object({
  foodItem: z.string().describe('影像中辨識出的食物品項。'),
  calorieEstimate: z.number().describe('食物品項的估計卡路里數。'),
  confidence: z.number().describe('卡路里估計的信賴度（0-1）。'),
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
          "食物品項的照片，格式為 data URI，必須包含 MIME 類型並使用 Base64 編碼。預期格式：'data:<mimetype>;base64,<encoded_data>'。"
        ),
    }),
  },
  output: {
    schema: z.object({
      foodItem: z.string().describe('影像中辨識出的食物品項。'),
      calorieEstimate: z.number().describe('食物品項的估計卡路里數。'),
      confidence: z.number().describe('卡路里估計的信賴度（0-1）。'),
    }),
  },
  prompt: `你是營養專家。你將辨識影像中的食物品項並估計其卡路里數。

  分析以下影像，並提供食物品項、卡路里估計值和信賴度。

  影像： {{media url=photoDataUri}}
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
