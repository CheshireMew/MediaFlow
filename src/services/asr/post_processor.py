from typing import List, Tuple
from src.models.schemas import SubtitleSegment

class PostProcessor:
    @staticmethod
    def merge_segments(all_segments: List[SubtitleSegment]) -> Tuple[List[SubtitleSegment], str]:
        """Merge and sort segments from multiple chunks."""
        final_segments_list = []
        if all_segments:
             all_segments.sort(key=lambda x: x.start)
             final_segments_list.append(all_segments[0])
             for i in range(1, len(all_segments)):
                  prev = final_segments_list[-1]
                  curr = all_segments[i]
                  
                  is_single_word = " " not in curr.text.strip()
                  # Using a slightly larger tolerance for merging logic
                  is_close = (curr.start - prev.end) < 0.5
                  
                  if is_single_word and is_close and (len(prev.text) + len(curr.text) < 60):
                       prev.text += " " + curr.text
                       prev.end = curr.end
                  else:
                       final_segments_list.append(curr)
        
        # Re-index
        final_segments = []
        full_text_list = []
        for i, seg in enumerate(final_segments_list):
            seg.id = str(i + 1)
            final_segments.append(seg)
            full_text_list.append(seg.text)
            
        return final_segments, "\n".join(full_text_list)
