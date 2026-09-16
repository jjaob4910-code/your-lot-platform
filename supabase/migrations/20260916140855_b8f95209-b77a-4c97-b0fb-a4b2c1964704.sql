CREATE POLICY "work_orders_read" ON storage.objects FOR SELECT USING (bucket_id = 'work-orders');
CREATE POLICY "work_orders_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'work-orders');
CREATE POLICY "work_orders_delete" ON storage.objects FOR DELETE USING (bucket_id = 'work-orders');