Lumen now loads TV episode metadata in bounded season batches. Large-series
request sheets make fewer API calls, retain successfully loaded seasons when
some metadata is unavailable, and retry only the missing seasons while
preserving the selected episodes.
