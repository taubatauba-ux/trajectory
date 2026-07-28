import { useLiveQuery } from 'dexie-react-hooks';
import { getAllPhotosSorted } from './photoStore';
import type { ProgressPhoto } from '../../types';

export function usePhotos(): ProgressPhoto[] | undefined {
  return useLiveQuery(() => getAllPhotosSorted(), []);
}
