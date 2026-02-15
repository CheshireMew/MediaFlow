import { apiClient } from "../api/client";

export interface EnhanceRequest {
  video_path: string;
  model?: string;
  scale?: string;
}

export interface CleanRequest {
  video_path: string;
  roi: [number, number, number, number];
  method?: string;
}

export interface PreprocessingResponse {
  task_id: string;
  status: string;
  message: string;
}

export const preprocessingService = {
  enhanceVideo: async (
    data: EnhanceRequest,
  ): Promise<PreprocessingResponse> => {
    return apiClient.post<PreprocessingResponse>(
      "/api/v1/preprocessing/enhance",
      data,
    );
  },

  cleanVideo: async (data: CleanRequest): Promise<PreprocessingResponse> => {
    return apiClient.post<PreprocessingResponse>(
      "/api/v1/preprocessing/clean",
      data,
    );
  },
};
