
ALTER TABLE public.conversations ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.chat_messages ALTER COLUMN user_id SET NOT NULL;

CREATE POLICY "Users can update their own chat messages"
ON public.chat_messages
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Anyone can view public chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Public read chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Public can view chat attachments" ON storage.objects;
