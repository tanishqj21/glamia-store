-- A verified late capture records its refund without resurrecting stock or fulfilment.
CREATE TRIGGER queue_late_cancellation AFTER UPDATE OF payment_status ON orders
WHEN NEW.status='cancelled' AND NEW.payment_status='paid' AND OLD.payment_status NOT IN ('paid','refunded')
 AND NOT EXISTS(SELECT 1 FROM cancellation_refunds WHERE order_id=NEW.id)
 AND COALESCE(OLD.order_type,'standard')!='replacement' BEGIN
  INSERT INTO cancellation_refunds(id,order_id,provider,provider_order_id,provider_payment_id,total_paise,gateway_paise,
    credit_amount,order_total_paise,original_credit_amount,original_gateway_paise,dispatch_eligible,state,last_error,evidence_json)
  SELECT 'gmcr_'||lower(hex(randomblob(16))),NEW.id,COALESCE(NULLIF(NEW.payment_gateway,''),NEW.payment_method,''),
    COALESCE(NEW.gateway_order_id,''),COALESCE(NEW.gateway_payment_id,''),ROUND(NEW.total*100),ROUND(COALESCE(NEW.payable_total,NEW.total)*100),
    COALESCE(NEW.credits_used,0),ROUND(NEW.total*100),COALESCE(NEW.credits_used,0),ROUND(COALESCE(NEW.payable_total,NEW.total)*100),
    CASE WHEN COALESCE(OLD.tracking_number,'')='' THEN 1 ELSE 0 END,
    CASE
      WHEN COALESCE(OLD.tracking_number,'')!='' THEN 'reconciliation_required'
      WHEN EXISTS(SELECT 1 FROM gateway_refunds g WHERE g.order_id=NEW.id OR g.provider_payment_id=NEW.gateway_payment_id) THEN 'reconciliation_required'
      WHEN COALESCE(NEW.gateway_payment_id,'')!='' AND EXISTS(SELECT 1 FROM cancellation_refunds c
        WHERE c.provider=NEW.payment_gateway AND c.provider_payment_id=NEW.gateway_payment_id) THEN 'reconciliation_required'
      WHEN NEW.payment_method='store_credit' AND COALESCE(NEW.payable_total,NEW.total)=0 AND NEW.total=NEW.credits_used AND NEW.total>0 THEN 'processed'
      WHEN NEW.payment_method IN ('razorpay','phonepe') AND NEW.payment_gateway=NEW.payment_method
        AND COALESCE(NEW.gateway_order_id,'')!='' AND COALESCE(NEW.gateway_payment_id,'')!=''
        AND ROUND(NEW.total*100)=ROUND(COALESCE(NEW.payable_total,NEW.total)*100)+COALESCE(NEW.credits_used,0)*100
        AND ROUND(COALESCE(NEW.payable_total,NEW.total)*100)>=100 THEN 'approved'
      ELSE 'reconciliation_required' END,
    '',json_object('stage','verified_late_capture','credits_restored_by','credit_checkout_release');
END;
