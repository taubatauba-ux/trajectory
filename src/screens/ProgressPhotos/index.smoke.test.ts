// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { createElement } from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { db } from '../../data/db';
import ProgressPhotos from './index';

// jsdom doesn't implement URL.createObjectURL/revokeObjectURL. Every photo-displaying
// component in this screen goes through useObjectUrl, which calls these — without a
// stub they throw inside a useEffect (an uncaught, async exception that's hard to
// attribute back to the right test), so every test here needs it, not just the ones
// that look like they touch a photo directly.
let objectUrlCounter = 0;
URL.createObjectURL = () => `blob:test-${objectUrlCounter++}`;
URL.revokeObjectURL = () => {};

function makeImageFile(name: string, content = 'fake-bytes'): File {
  return new File([content], name, { type: 'image/jpeg' });
}

describe('ProgressPhotos screen (smoke)', () => {
  afterEach(() => cleanup());

  beforeEach(async () => {
    await db.progressPhotos.clear();
  });

  it('shows the empty state with no photos yet', async () => {
    render(createElement(ProgressPhotos));
    expect(await screen.findByText(/No progress photos yet/i)).toBeTruthy();
  });

  it('adding a photo: file picker → capture sheet → save → appears in the grid', async () => {
    const { container } = render(createElement(ProgressPhotos));
    // usePhotos()'s useLiveQuery resolves asynchronously; the screen shows only
    // "Loading…" until then, so the file input isn't in the DOM yet on the first
    // synchronous render. Wait for the real content before querying for it.
    await screen.findByText('+ Add photo');
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();

    fireEvent.change(fileInput, { target: { files: [makeImageFile('front.jpg')] } });

    // Capture sheet should appear with a save button.
    await screen.findByText('Save photo');
    fireEvent.click(screen.getByText('Save photo'));

    // Sheet closes; the photo shows up in the grid (grid renders a delete button per photo).
    await waitFor(() => expect(screen.queryByText('Save photo')).toBeNull());
    const stored = await db.progressPhotos.toArray();
    expect(stored).toHaveLength(1);
  });

  it('selecting two photos shows the comparison view with days-apart', async () => {
    await db.progressPhotos.bulkAdd([
      { id: 'p1', date: '2026-06-01', blob: new Blob(['a'], { type: 'image/jpeg' }) },
      { id: 'p2', date: '2026-07-01', blob: new Blob(['b'], { type: 'image/jpeg' }) },
    ]);

    render(createElement(ProgressPhotos));
    const first = await screen.findByLabelText(/Select photo from 1 Jun 2026/);
    const second = await screen.findByLabelText(/Select photo from 1 Jul 2026/);

    fireEvent.click(first);
    expect(await screen.findByText(/Select one more photo/i)).toBeTruthy();

    fireEvent.click(second);
    await waitFor(() => expect(screen.getByText('30 days apart')).toBeTruthy());
  });

  it('deleting a photo removes it and clears its selection', async () => {
    await db.progressPhotos.add({ id: 'p1', date: '2026-06-01', blob: new Blob(['a'], { type: 'image/jpeg' }) });
    render(createElement(ProgressPhotos));

    const select = await screen.findByLabelText(/Select photo from 1 Jun 2026/);
    fireEvent.click(select);
    await screen.findByText(/Select one more photo/i);

    fireEvent.click(screen.getByLabelText(/Delete photo from 1 Jun 2026/));

    await waitFor(async () => expect(await db.progressPhotos.count()).toBe(0));
    expect(await screen.findByText(/No progress photos yet/i)).toBeTruthy();
  });
});
